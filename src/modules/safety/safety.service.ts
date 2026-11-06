import { Injectable } from '@nestjs/common';
import { DomainError } from '@/common/errors/domain-error';
import { ErrorCode } from '@/common/errors/error-codes';
import { RateLimiter } from '@/infra/redis/rate-limiter.service';
import { ChatService } from '@/modules/chat';
import { MatchingService } from '@/modules/matching';
import { PhotosService } from '@/modules/photos';
import { ProfilesService } from '@/modules/profiles';
import { UsersService } from '@/modules/users';
import type { BlockedListDto, ReportDto } from './dto/safety.dto';
import { SafetyRepository } from './safety.repository';

const REPORTS_PER_DAY = 20;

/** Block and report. Blocks are mutual and take effect everywhere at once. */
@Injectable()
export class SafetyService {
  constructor(
    private readonly repo: SafetyRepository,
    private readonly users: UsersService,
    private readonly matching: MatchingService,
    private readonly profiles: ProfilesService,
    private readonly photos: PhotosService,
    private readonly chat: ChatService,
    private readonly rateLimiter: RateLimiter,
  ) {}

  /** Idempotent. Ends any match (the chat closes) and keeps them out of each other's Discover. */
  async block(userId: string, otherId: string): Promise<void> {
    if (otherId === userId) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'You can’t block yourself.', {
        status: 400,
      });
    }
    if (!(await this.users.findById(otherId))) {
      throw new DomainError(ErrorCode.MEMBER_NOT_FOUND, 'This profile is no longer available.', {
        status: 404,
      });
    }
    await this.repo.block(userId, otherId);
    await this.matching.separate(userId, otherId);
  }

  /**
   * They can appear again only where nothing else hides them: a match that ended stays ended, and
   * people already liked or passed stay out of Discover.
   */
  async unblock(userId: string, otherId: string): Promise<void> {
    await this.repo.unblock(userId, otherId);
  }

  async listBlocked(userId: string): Promise<BlockedListDto> {
    const rows = await this.repo.listBlocked(userId);
    const names = await this.profiles.displayNames(rows.map((r) => r.userId));
    return {
      items: rows.map((r) => ({
        userId: r.userId,
        displayName: names.get(r.userId) ?? 'Flinger member',
        blockedAt: r.createdAt.toISOString(),
      })),
    };
  }

  /** File a report for moderators, keeping a snapshot of what was reported. */
  async report(userId: string, input: ReportDto): Promise<{ id: string }> {
    if (input.reportedId === userId) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'You can’t report yourself.', {
        status: 400,
      });
    }
    const limit = await this.rateLimiter.hit('report', userId, REPORTS_PER_DAY, 86_400);
    if (!limit.allowed) {
      throw new DomainError(ErrorCode.RATE_LIMITED, 'You’ve sent a lot of reports today.', {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfterSeconds) },
      });
    }
    if (!(await this.users.findById(input.reportedId))) {
      throw new DomainError(ErrorCode.MEMBER_NOT_FOUND, 'This profile is no longer available.', {
        status: 404,
      });
    }

    const snapshot = await this.snapshot(userId, input);
    const row = await this.repo.insertReport({
      reporterId: userId,
      reportedId: input.reportedId,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      reason: input.reason,
      details: input.details || null,
      snapshot,
    });
    if (input.alsoBlock) await this.block(userId, input.reportedId);
    return { id: row.id };
  }

  private async snapshot(userId: string, input: ReportDto): Promise<Record<string, unknown>> {
    const invalid = () =>
      new DomainError(ErrorCode.REPORT_TARGET_INVALID, 'We couldn’t find what you reported.', {
        status: 422,
      });
    switch (input.targetType) {
      case 'user':
        return { userId: input.reportedId };
      case 'photo': {
        const photo = await this.photos.reportSnapshot(input.reportedId, input.targetId as string);
        if (!photo) throw invalid();
        return photo;
      }
      case 'prompt': {
        const [answer] = await this.profiles.promptAnswers([input.targetId as string]);
        if (!answer || answer.userId !== input.reportedId) throw invalid();
        return { promptAnswerId: answer.id, text: answer.text, answer: answer.answer };
      }
      case 'message': {
        const messages = await this.chat.reportSnapshot(
          userId,
          input.reportedId,
          input.targetId as string,
        );
        if (!messages) throw invalid();
        return { messages };
      }
    }
  }
}
