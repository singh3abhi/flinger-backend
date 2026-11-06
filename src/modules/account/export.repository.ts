import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '@/infra/database/database.module';
import { dataExports, type DataExportRow } from '@/infra/database/schema';

type Row = Record<string, unknown>;

/**
 * "Download my data". Writes `data_exports`; gathering reads many modules' tables in read-only SQL
 * (one place that knows the whole picture of a member's data, like the discovery candidates query).
 */
@Injectable()
export class ExportRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async create(userId: string): Promise<DataExportRow> {
    const [row] = await this.db.insert(dataExports).values({ userId }).returning();
    return row;
  }

  async finish(
    id: string,
    changes: Partial<Pick<DataExportRow, 'status' | 'storageKey' | 'expiresAt'>>,
  ) {
    await this.db.update(dataExports).set(changes).where(eq(dataExports.id, id));
  }

  async find(userId: string, id: string): Promise<DataExportRow | undefined> {
    const [row] = await this.db
      .select()
      .from(dataExports)
      .where(and(eq(dataExports.id, id), eq(dataExports.userId, userId)))
      .limit(1);
    return row;
  }

  async latest(userId: string): Promise<DataExportRow | undefined> {
    const [row] = await this.db
      .select()
      .from(dataExports)
      .where(eq(dataExports.userId, userId))
      .orderBy(desc(dataExports.createdAt))
      .limit(1);
    return row;
  }

  /** Everything we hold about this member, as plain rows. Other people appear by first name only. */
  async gather(userId: string): Promise<Record<string, Row[]>> {
    const q = async (query: ReturnType<typeof sql>) => (await this.db.execute<Row>(query)).rows;
    const [
      account,
      identities,
      profile,
      answers,
      prompts,
      photos,
      preferences,
      settings,
      consents,
    ] = await Promise.all([
      q(sql`SELECT id, status, created_at, last_active_at FROM users WHERE id = ${userId}`),
      q(
        sql`SELECT provider, subject, verified_at, created_at FROM auth_identities WHERE user_id = ${userId}`,
      ),
      q(sql`SELECT p.display_name, p.birth_date, p.gender, p.height_cm, p.kids_status, p.family_plans,
                     p.religion, p.politics, p.bio, pl.display_name AS city, p.location_updated_at,
                     p.onboarding_completed_at, p.created_at
              FROM profiles p LEFT JOIN places pl ON pl.id = p.place_id WHERE p.user_id = ${userId}`),
      q(
        sql`SELECT kind, value FROM profile_attributes WHERE user_id = ${userId} ORDER BY kind, value`,
      ),
      q(sql`SELECT pr.text AS prompt, pp.answer, pp.position FROM profile_prompts pp
              JOIN prompts pr ON pr.id = pp.prompt_id WHERE pp.user_id = ${userId} ORDER BY pp.position`),
      q(sql`SELECT id, position, status, width, height, created_at FROM profile_photos
              WHERE user_id = ${userId} ORDER BY position`),
      q(sql`SELECT min_age, max_age, max_distance_km, show_distance, expand_radius_when_empty
              FROM preferences WHERE user_id = ${userId}`),
      q(
        sql`SELECT read_receipts, notify_new_matches, notify_new_messages FROM user_settings WHERE user_id = ${userId}`,
      ),
      q(sql`SELECT document, version, accepted_at FROM user_consents WHERE user_id = ${userId}`),
    ]);
    const [likesSent, likesReceived, matches, messages, blocks, reportsFiled, devices] =
      await Promise.all([
        q(sql`SELECT s.direction, s.item_type, s.comment, s.created_at, p.display_name AS to_name
            FROM swipes s LEFT JOIN profiles p ON p.user_id = s.target_id
            WHERE s.swiper_id = ${userId} ORDER BY s.created_at`),
        q(sql`SELECT s.item_type, s.comment, s.created_at, p.display_name AS from_name
            FROM swipes s LEFT JOIN profiles p ON p.user_id = s.swiper_id
            WHERE s.target_id = ${userId} AND s.direction = 'like' ORDER BY s.created_at`),
        q(sql`SELECT m.id, m.created_at, m.unmatched_at, p.display_name AS with_name
            FROM matches m LEFT JOIN profiles p
              ON p.user_id = CASE WHEN m.user_a = ${userId} THEN m.user_b ELSE m.user_a END
            WHERE m.user_a = ${userId} OR m.user_b = ${userId} ORDER BY m.created_at`),
        q(sql`SELECT x.conversation_id, (x.sender_id = ${userId}) AS from_me, x.body, x.created_at
            FROM messages x JOIN matches m ON m.id = x.conversation_id
            WHERE m.user_a = ${userId} OR m.user_b = ${userId} ORDER BY x.conversation_id, x.id`),
        q(sql`SELECT p.display_name AS blocked_name, b.created_at FROM blocks b
            LEFT JOIN profiles p ON p.user_id = b.blocked_id WHERE b.blocker_id = ${userId}`),
        q(
          sql`SELECT target_type, reason, details, status, created_at FROM reports WHERE reporter_id = ${userId}`,
        ),
        q(
          sql`SELECT platform, push_provider, last_seen_at, created_at FROM devices WHERE user_id = ${userId}`,
        ),
      ]);
    return {
      account,
      identities,
      profile,
      answers,
      prompts,
      photos,
      preferences,
      settings,
      consents,
      likesSent,
      likesReceived,
      matches,
      messages,
      blocks,
      reportsFiled,
      devices,
    };
  }
}
