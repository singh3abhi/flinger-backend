import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError, NotFoundError } from '@/common/errors/domain-error';
import { ErrorCode } from '@/common/errors/error-codes';
import { RateLimiter } from '@/infra/redis/rate-limiter.service';
import { OBJECT_STORAGE, type ObjectStorage } from '@/infra/storage/storage.module';
import { AuthService } from '@/modules/auth';
import { MatchingService } from '@/modules/matching';
import { NotificationsService } from '@/modules/notifications';
import { PhotosService } from '@/modules/photos';
import { UsersService } from '@/modules/users';
import { ExportRepository } from './export.repository';

/** Deleted accounts are erased this long after deletion (Privacy Policy; D-39). */
export const ERASE_AFTER_DAYS = 30;
const EXPORT_VALID_DAYS = 7;
const EXPORTS_PER_DAY = 2;

export interface ExportView {
  id: string;
  status: 'pending' | 'ready' | 'failed';
  /** Short-lived download link (ready exports only). */
  url: string | null;
  expiresAt: string | null;
  createdAt: string;
}

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly matching: MatchingService,
    private readonly notifications: NotificationsService,
    private readonly photos: PhotosService,
    private readonly exports: ExportRepository,
    private readonly rateLimiter: RateLimiter,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** Idempotent: pausing a paused account is fine; only finished accounts can pause. */
  async pause(userId: string): Promise<void> {
    if (await this.users.pause(userId)) return;
    const user = await this.users.findById(userId);
    if (user?.status !== 'paused') {
      throw new DomainError(ErrorCode.CONFLICT, 'Finish your profile before pausing it.', {
        status: 409,
      });
    }
  }

  async unpause(userId: string): Promise<void> {
    await this.users.unpause(userId);
  }

  /**
   * Delete my account. Immediately: hidden from everyone, matches ended (chats close), signed out
   * everywhere, pushes stopped, email/phone free to sign up again. Erased for good after 30 days.
   */
  async delete(userId: string, confirm: string): Promise<void> {
    if (confirm !== 'DELETE') {
      throw new DomainError(ErrorCode.CONFIRMATION_REQUIRED, 'Type DELETE to confirm.', {
        status: 400,
      });
    }
    await this.users.markDeleted(userId);
    await this.matching.endAllFor(userId);
    await this.notifications.forgetDevices(userId);
    await this.auth.forget(userId);
  }

  /** Erase accounts deleted more than 30 days ago (worker job). Returns how many were erased. */
  async purgeDeleted(now: Date = new Date(), batch = 50): Promise<number> {
    const cutoff = new Date(now.getTime() - ERASE_AFTER_DAYS * 86_400_000);
    const ids = await this.users.deletedBefore(cutoff, batch);
    for (const id of ids) {
      for (const key of await this.photos.storageKeysOf(id)) {
        await this.storage.delete(key).catch(() => undefined);
      }
      await this.users.hardDelete(id);
    }
    if (ids.length > 0) this.logger.log(`Erased ${ids.length} deleted account(s)`);
    return ids.length;
  }

  /** Build "download my data" now (small, synchronous for v1; a worker job later: D-40). */
  async requestExport(userId: string): Promise<ExportView> {
    const limit = await this.rateLimiter.hit('export', userId, EXPORTS_PER_DAY, 86_400);
    if (!limit.allowed) {
      throw new DomainError(ErrorCode.RATE_LIMITED, 'You can request your data twice a day.', {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfterSeconds) },
      });
    }
    const row = await this.exports.create(userId);
    try {
      const data = await this.exports.gather(userId);
      const key = `exports/${userId}/${row.id}.json`;
      const body = JSON.stringify({ generatedAt: new Date().toISOString(), ...data }, null, 2);
      await this.storage.put(key, body, 'application/json');
      const expiresAt = new Date(Date.now() + EXPORT_VALID_DAYS * 86_400_000);
      await this.exports.finish(row.id, { status: 'ready', storageKey: key, expiresAt });
    } catch (error) {
      await this.exports.finish(row.id, { status: 'failed' });
      throw error;
    }
    return this.getExport(userId, row.id);
  }

  async getExport(userId: string, id: string): Promise<ExportView> {
    const row = await this.exports.find(userId, id);
    if (!row) throw new NotFoundError('Export not found');
    const live =
      row.status === 'ready' && row.storageKey && row.expiresAt && row.expiresAt > new Date();
    return {
      id: row.id,
      status: row.status,
      url: live ? await this.storage.presignDownload(row.storageKey as string, 3600) : null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
