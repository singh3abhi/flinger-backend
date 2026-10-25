import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { Cursor } from '@/common/pagination';
import { DRIZZLE, type Database, type Executor } from '@/infra/database/database.module';
import { matches, swipes, type MatchRow, type SwipeRow } from '@/infra/database/schema';

type NewSwipe = Pick<SwipeRow, 'swiperId' | 'targetId' | 'direction'> &
  Partial<Pick<SwipeRow, 'itemType' | 'itemId' | 'comment'>>;

/** Users are stored as an ordered pair in `matches`. */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** The only place that touches `swipes` and `matches`. */
@Injectable()
export class MatchingRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Serialise everything that happens between two people (simultaneous likes, like vs unmatch) for
   * the rest of the transaction, so a match is never lost or created twice.
   */
  async lockPair(a: string, b: string, tx: Executor): Promise<void> {
    const [first, second] = orderedPair(a, b);
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${first}:${second}`}, 0))`,
    );
  }

  async findSwipe(swiperId: string, targetId: string, executor: Executor = this.db) {
    const [row] = await executor
      .select()
      .from(swipes)
      .where(and(eq(swipes.swiperId, swiperId), eq(swipes.targetId, targetId)))
      .limit(1);
    return row;
  }

  /** Insert unless this pair already has a decision. Returns the row only if it was inserted. */
  async insertSwipe(swipe: NewSwipe, executor: Executor = this.db): Promise<SwipeRow | undefined> {
    const [row] = await executor.insert(swipes).values(swipe).onConflictDoNothing().returning();
    return row;
  }

  /** Create the match for this pair. Returns it only if this call created it. */
  async createMatch(a: string, b: string, tx: Executor): Promise<MatchRow | undefined> {
    const [userA, userB] = orderedPair(a, b);
    const [row] = await tx
      .insert(matches)
      .values({ userA, userB })
      .onConflictDoNothing()
      .returning();
    return row;
  }

  async findMatchById(matchId: string, executor: Executor = this.db) {
    const [row] = await executor.select().from(matches).where(eq(matches.id, matchId)).limit(1);
    return row;
  }

  async findMatchForPair(a: string, b: string, executor: Executor = this.db) {
    const [userA, userB] = orderedPair(a, b);
    const [row] = await executor
      .select()
      .from(matches)
      .where(and(eq(matches.userA, userA), eq(matches.userB, userB)))
      .limit(1);
    return row;
  }

  /** Everyone this member already decided on or matched with (to rebuild the seen filter). */
  async decidedIds(userId: string): Promise<string[]> {
    const rows = await this.db.execute<{ id: string }>(sql`
      SELECT target_id AS id FROM swipes WHERE swiper_id = ${userId}
      UNION
      SELECT CASE WHEN user_a = ${userId} THEN user_b ELSE user_a END
      FROM matches WHERE user_a = ${userId} OR user_b = ${userId}`);
    return rows.rows.map((r) => r.id);
  }

  /**
   * Likes waiting for an answer: they liked me, I haven't decided on them, we aren't matched.
   * Newest first.
   */
  async likesReceived(userId: string, limit: number, cursor?: Cursor) {
    return this.db.execute<{
      id: string;
      swiper_id: string;
      item_type: 'photo' | 'prompt';
      item_id: string;
      comment: string | null;
      created_at: Date;
    }>(sql`
      SELECT s.id, s.swiper_id, s.item_type, s.item_id, s.comment, s.created_at
      FROM swipes s
      WHERE s.target_id = ${userId}
        AND s.direction = 'like'
        AND NOT EXISTS (SELECT 1 FROM swipes mine WHERE mine.swiper_id = ${userId} AND mine.target_id = s.swiper_id)
        ${cursor ? sql`AND (s.created_at, s.id) < (${cursor.createdAt.toISOString()}::timestamptz, ${cursor.id}::uuid)` : sql``}
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT ${limit}`);
  }

  /** Current matches, newest first. */
  listMatches(userId: string, limit: number, cursor?: Cursor): Promise<MatchRow[]> {
    return this.db
      .select()
      .from(matches)
      .where(
        and(
          or(eq(matches.userA, userId), eq(matches.userB, userId)),
          isNull(matches.unmatchedAt),
          cursor
            ? or(
                lt(matches.createdAt, cursor.createdAt),
                and(eq(matches.createdAt, cursor.createdAt), lt(matches.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(matches.createdAt), desc(matches.id))
      .limit(limit);
  }

  /** End a match. Returns false if it isn't this member's current match. */
  async unmatch(matchId: string, userId: string, tx: Executor): Promise<MatchRow | undefined> {
    const [row] = await tx
      .update(matches)
      .set({ unmatchedAt: new Date(), unmatchedBy: userId })
      .where(
        and(
          eq(matches.id, matchId),
          or(eq(matches.userA, userId), eq(matches.userB, userId)),
          isNull(matches.unmatchedAt),
        ),
      )
      .returning();
    return row;
  }

  /** Which of `ids` have liked this member. */
  async likersAmong(userId: string, ids: readonly string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .select({ id: swipes.swiperId })
      .from(swipes)
      .where(
        and(
          eq(swipes.targetId, userId),
          eq(swipes.direction, 'like'),
          inArray(swipes.swiperId, [...ids]),
        ),
      );
    return new Set(rows.map((r) => r.id));
  }
}
