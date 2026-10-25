import { Injectable } from '@nestjs/common';
import { DomainError, NotFoundError } from '@/common/errors/domain-error';
import { ErrorCode } from '@/common/errors/error-codes';
import { LIMITS } from '@/common/limits';
import { decodeCursor, encodeCursor } from '@/common/pagination';
import { TransactionManager } from '@/infra/database/transaction.manager';
import { RateLimiter } from '@/infra/redis/rate-limiter.service';
import { PhotosService } from '@/modules/photos';
import { ProfilesService } from '@/modules/profiles';
import { UsersService } from '@/modules/users';
import type { LikeResultDto, LimitsDto, MatchListDto, ReceivedLikesDto } from './dto/matching.dto';
import { LikesCounter } from './likes-counter';
import { MatchingRepository } from './matching.repository';
import { SeenFilter } from './seen-filter';

const PASSES_PER_HOUR = 600;

export interface LikeInput {
  targetId: string;
  itemType: 'photo' | 'prompt';
  itemId: string;
  comment?: string;
}

@Injectable()
export class MatchingService {
  constructor(
    private readonly repo: MatchingRepository,
    private readonly tx: TransactionManager,
    private readonly users: UsersService,
    private readonly profiles: ProfilesService,
    private readonly photos: PhotosService,
    private readonly likes: LikesCounter,
    private readonly seen: SeenFilter,
    private readonly rateLimiter: RateLimiter,
  ) {}

  /** Which of `ids` already liked this member (a strong signal for the deck). */
  likersAmong(userId: string, ids: readonly string[]): Promise<Set<string>> {
    return this.repo.likersAmong(userId, ids);
  }

  /** They liked me, or we are matched: I may open their full profile from Liked You or Matches. */
  async isConnected(userId: string, otherId: string): Promise<boolean> {
    const [likers, match] = await Promise.all([
      this.repo.likersAmong(userId, [otherId]),
      this.repo.findMatchForPair(userId, otherId),
    ]);
    return likers.has(otherId) || (match !== undefined && match.unmatchedAt === null);
  }

  /** Members this member already decided on (for the discovery deck). */
  seenFilter() {
    return {
      unseen: (userId: string, ids: readonly string[]) =>
        this.seen.unseen(userId, ids, () => this.repo.decidedIds(userId)),
    };
  }

  /**
   * Like someone through one of their photos or prompts. Counts against the daily limit, is safe
   * to retry, and creates the match when they already liked back.
   */
  async like(userId: string, input: LikeInput): Promise<LikeResultDto> {
    const { targetId } = input;
    await this.assertCanSee(userId, targetId);
    await this.assertItemBelongs(targetId, input.itemType, input.itemId);

    const existing = await this.repo.findSwipe(userId, targetId);
    if (existing?.direction === 'pass') {
      throw new DomainError(ErrorCode.ALREADY_PASSED, 'You passed on this person.', {
        status: 409,
      });
    }
    if (existing) return this.likeResult(userId, targetId);

    const perDay = LIMITS.dailyLikes;
    const quota = await this.likes.take(userId, perDay);
    if (!quota.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((quota.window.resetsAt.getTime() - Date.now()) / 1000),
      );
      throw new DomainError(
        ErrorCode.LIKE_LIMIT_REACHED,
        `You’ve used your ${perDay} likes for today. They refill at 4 am.`,
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }

    const inserted = await this.tx.run(async (t) => {
      await this.repo.lockPair(userId, targetId, t);
      const row = await this.repo.insertSwipe(
        {
          swiperId: userId,
          targetId,
          direction: 'like',
          itemType: input.itemType,
          itemId: input.itemId,
          comment: input.comment ?? null,
        },
        t,
      );
      if (!row) return false;
      const theirs = await this.repo.findSwipe(targetId, userId, t);
      if (theirs?.direction === 'like') await this.repo.createMatch(userId, targetId, t);
      return true;
    });
    // A concurrent retry already stored this like: don't charge for it twice.
    if (!inserted) await this.likes.giveBack(userId);

    await this.markSeen(userId, targetId);
    return this.likeResult(userId, targetId);
  }

  /** Not interested. Safe to retry; a pass never undoes a like. */
  async pass(userId: string, targetId: string): Promise<void> {
    if (targetId === userId) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'You can’t pass on yourself.', {
        status: 400,
      });
    }
    const limit = await this.rateLimiter.hit('pass', userId, PASSES_PER_HOUR, 3600);
    if (!limit.allowed) {
      throw new DomainError(ErrorCode.RATE_LIMITED, 'Slow down a little.', {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfterSeconds) },
      });
    }
    if (!(await this.users.findById(targetId))) throw this.memberNotFound();
    await this.repo.insertSwipe({ swiperId: userId, targetId, direction: 'pass' });
    await this.markSeen(userId, targetId);
  }

  async limits(userId: string): Promise<LimitsDto> {
    const perDay = LIMITS.dailyLikes;
    const { used, window } = await this.likes.used(userId);
    return {
      likesPerDay: perDay,
      likesUsed: Math.min(used, perDay),
      likesRemaining: Math.max(0, perDay - used),
      resetsAt: window.resetsAt.toISOString(),
    };
  }

  /** "Liked You": who liked me, on what, with their comment. Newest first. */
  async likesReceived(userId: string, limit: number, cursor?: string): Promise<ReceivedLikesDto> {
    const page = await this.repo.likesReceived(userId, limit + 1, decodeCursor(cursor));
    const rows = page.rows.slice(0, limit);
    const [summaries, prompts, photos] = await Promise.all([
      this.profiles.summaries(rows.map((r) => r.swiper_id)),
      this.profiles.promptAnswers(
        rows.filter((r) => r.item_type === 'prompt').map((r) => r.item_id),
      ),
      this.photos.approvedFor([userId]),
    ]);
    const promptById = new Map(prompts.map((p) => [p.id, p]));
    const photoById = new Map((photos.get(userId) ?? []).map((p) => [p.id, p]));

    const items = rows.flatMap((r) => {
      const from = summaries.get(r.swiper_id);
      if (!from) return []; // hidden, paused or deleted since
      const prompt = r.item_type === 'prompt' ? promptById.get(r.item_id) : undefined;
      return [
        {
          likeId: r.id,
          from,
          item: {
            type: r.item_type,
            id: r.item_id,
            photoUrl: r.item_type === 'photo' ? (photoById.get(r.item_id)?.url ?? null) : null,
            promptText: prompt?.text ?? null,
            promptAnswer: prompt?.answer ?? null,
          },
          comment: r.comment,
          createdAt: new Date(r.created_at).toISOString(),
        },
      ];
    });
    const last = rows.at(-1);
    return {
      items,
      nextCursor:
        page.rows.length > limit && last
          ? encodeCursor({ createdAt: new Date(last.created_at), id: last.id })
          : null,
    };
  }

  async matches(userId: string, limit: number, cursor?: string): Promise<MatchListDto> {
    const page = await this.repo.listMatches(userId, limit + 1, decodeCursor(cursor));
    const rows = page.slice(0, limit);
    const partnerOf = (m: (typeof rows)[number]) => (m.userA === userId ? m.userB : m.userA);
    const summaries = await this.profiles.summaries(rows.map(partnerOf));
    const items = rows.flatMap((m) => {
      const member = summaries.get(partnerOf(m));
      return member ? [{ matchId: m.id, member, createdAt: m.createdAt.toISOString() }] : [];
    });
    const last = rows.at(-1);
    return {
      items,
      nextCursor:
        page.length > limit && last
          ? encodeCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  /** End a match for both people. They won't see each other again. */
  async unmatch(userId: string, matchId: string): Promise<void> {
    const ended = await this.tx.run((t) => this.repo.unmatch(matchId, userId, t));
    if (!ended) throw new NotFoundError('Match not found');
  }

  private async likeResult(userId: string, targetId: string): Promise<LikeResultDto> {
    const [match, limits] = await Promise.all([
      this.repo.findMatchForPair(userId, targetId),
      this.limits(userId),
    ]);
    const live = match && !match.unmatchedAt ? match : undefined;
    return {
      matched: live !== undefined,
      matchId: live?.id ?? null,
      likesRemaining: limits.likesRemaining,
      resetsAt: limits.resetsAt,
    };
  }

  private async assertCanSee(userId: string, targetId: string): Promise<void> {
    if (targetId === userId) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'You can’t like yourself.', {
        status: 400,
      });
    }
    const target = await this.users.findById(targetId);
    if (!target || target.status !== 'active') throw this.memberNotFound();
    if (!(await this.profiles.summaries([targetId])).has(targetId)) throw this.memberNotFound();
  }

  private async assertItemBelongs(targetId: string, type: 'photo' | 'prompt', itemId: string) {
    const belongs =
      type === 'photo'
        ? ((await this.photos.approvedFor([targetId])).get(targetId) ?? []).some(
            (p) => p.id === itemId,
          )
        : (await this.profiles.promptAnswers([itemId])).some((p) => p.userId === targetId);
    if (!belongs) {
      throw new DomainError(
        ErrorCode.LIKE_ITEM_INVALID,
        'That photo or prompt is no longer on their profile.',
        {
          status: 422,
        },
      );
    }
  }

  private markSeen(userId: string, targetId: string): Promise<void> {
    return this.seen.add(userId, [targetId], () => this.repo.decidedIds(userId));
  }

  private memberNotFound(): DomainError {
    return new DomainError(ErrorCode.MEMBER_NOT_FOUND, 'This profile is no longer available.', {
      status: 404,
    });
  }
}
