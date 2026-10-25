import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError, NotFoundError } from '@/common/errors/domain-error';
import { ErrorCode } from '@/common/errors/error-codes';
import { LIMITS } from '@/common/limits';
import { uuidv7 } from '@/common/utils/uuid';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';
import type { ProfilePhotoRow } from '@/infra/database/schema';
import { TransactionManager } from '@/infra/database/transaction.manager';
import { RateLimiter } from '@/infra/redis/rate-limiter.service';
import { OBJECT_STORAGE, type ObjectStorage } from '@/infra/storage/storage.module';
import { UsersService } from '@/modules/users';
import { MAX_PHOTO_BYTES, type PhotoDto, type PhotoUploadDto } from './dto/photo.dto';
import { SNIFF_BYTES, sniffImageType, type PhotoContentType } from './image-sniff';
import { PhotosRepository } from './photos.repository';

const UPLOAD_URL_TTL_SECONDS = 10 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;
/** A reserved slot whose upload never completed is released after this long. */
const ABANDONED_UPLOAD_MS = 30 * 60 * 1000;
const UPLOADS_PER_HOUR = 30;

/** Photos that count towards the 4-photo minimum (moderation may still be pending). */
const counts = (p: ProfilePhotoRow) => p.status === 'pending' || p.status === 'approved';

@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);

  constructor(
    private readonly repo: PhotosRepository,
    private readonly tx: TransactionManager,
    private readonly users: UsersService,
    private readonly rateLimiter: RateLimiter,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Uploaded photos in order. Reserved slots still uploading are not photos yet and are left out. */
  async listOwn(userId: string): Promise<PhotoDto[]> {
    const rows = (await this.repo.list(userId)).filter((row) => row.status !== 'uploading');
    return Promise.all(rows.map((row) => this.toDto(row)));
  }

  /** Reserve the next slot and return a short-lived URL to upload the bytes to. */
  async reserve(
    userId: string,
    input: { contentType: PhotoContentType; byteSize: number },
  ): Promise<PhotoUploadDto> {
    const limit = await this.rateLimiter.hit('photo-upload', userId, UPLOADS_PER_HOUR, 3600);
    if (!limit.allowed) {
      throw new DomainError(ErrorCode.RATE_LIMITED, 'Too many uploads. Please try again later.', {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfterSeconds) },
      });
    }

    const abandonedBefore = new Date(Date.now() - ABANDONED_UPLOAD_MS);
    const { row, released } = await this.tx.run(async (t) => {
      const rows = await this.repo.listForUpdate(userId, t);
      const released = rows.filter(
        (r) => r.status === 'uploading' && r.createdAt < abandonedBefore,
      );
      const kept = rows.filter((r) => !released.includes(r));
      if (kept.length >= LIMITS.photosMax) {
        throw new DomainError(
          ErrorCode.PHOTO_LIMIT_REACHED,
          `You can add up to ${LIMITS.photosMax} photos. Remove one to add another.`,
          { status: 409 },
        );
      }
      await this.repo.delete(
        released.map((r) => r.id),
        t,
      );
      await this.repo.setPositions(
        kept.map((r) => r.id),
        t,
      );
      const id = uuidv7();
      const row = await this.repo.insert(
        {
          id,
          userId,
          storageKey: `photos/${userId}/${id}`,
          position: kept.length + 1,
          contentType: input.contentType,
          byteSize: input.byteSize,
        },
        t,
      );
      return { row, released };
    });
    this.deleteObjects(released.map((r) => r.storageKey));

    const url = await this.storage.presignUpload(
      row.storageKey,
      row.contentType,
      UPLOAD_URL_TTL_SECONDS,
    );
    return {
      photo: await this.toDto(row),
      upload: {
        url,
        method: 'PUT',
        headers: { 'Content-Type': row.contentType },
        expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString(),
      },
    };
  }

  /**
   * The device says the upload finished. Check the object really is the image we approved, then
   * hand it to moderation. Safe to call again: a confirmed photo is returned as it is.
   */
  async complete(
    userId: string,
    photoId: string,
    size: { width: number; height: number },
  ): Promise<PhotoDto> {
    const row = await this.repo.find(userId, photoId);
    if (!row) throw new NotFoundError('Photo not found');
    if (row.status !== 'uploading') return this.toDto(row);

    const stored = await this.storage.head(row.storageKey);
    if (!stored) {
      throw new DomainError(
        ErrorCode.PHOTO_UPLOAD_MISSING,
        'We didn’t receive that photo. Please try uploading it again.',
        { status: 409 },
      );
    }
    const actualType = sniffImageType(await this.storage.readStart(row.storageKey, SNIFF_BYTES));
    if (stored.size > MAX_PHOTO_BYTES || actualType !== row.contentType) {
      // Not what was approved: discard it entirely so it can never be served.
      await this.tx.run((t) => this.repo.delete([row.id], t));
      this.deleteObjects([row.storageKey]);
      throw new DomainError(
        ErrorCode.PHOTO_INVALID_IMAGE,
        'That file isn’t a supported photo. Please choose a JPEG, PNG, WebP or HEIC image under 10 MB.',
        { status: 422 },
      );
    }

    const updated = await this.repo.update(row.id, {
      status: this.config.PHOTO_MODERATION === 'auto_approve' ? 'approved' : 'pending',
      byteSize: stored.size,
      width: size.width,
      height: size.height,
      uploadedAt: new Date(),
    });
    return this.toDto(updated);
  }

  /** New order for the member's uploaded photos (first = main). */
  async reorder(userId: string, photoIds: readonly string[]): Promise<PhotoDto[]> {
    await this.tx.run(async (t) => {
      const rows = await this.repo.listForUpdate(userId, t);
      const uploaded = rows.filter((r) => r.status !== 'uploading');
      const known = new Set(uploaded.map((r) => r.id));
      if (photoIds.length !== uploaded.length || photoIds.some((id) => !known.has(id))) {
        throw new DomainError(
          ErrorCode.VALIDATION_FAILED,
          'Send every uploaded photo exactly once, in the new order.',
          {
            status: 400,
            errors: [{ path: 'photoIds', message: 'must list every uploaded photo' }],
          },
        );
      }
      const pending = rows.filter((r) => r.status === 'uploading').map((r) => r.id);
      await this.repo.setPositions([...photoIds, ...pending], t);
    });
    return this.listOwn(userId);
  }

  /** Remove a photo. After onboarding a profile can't drop below the minimum. */
  async remove(userId: string, photoId: string): Promise<void> {
    const user = await this.users.findById(userId);
    const removed = await this.tx.run(async (t) => {
      const rows = await this.repo.listForUpdate(userId, t);
      const target = rows.find((r) => r.id === photoId);
      if (!target) throw new NotFoundError('Photo not found');
      const rest = rows.filter((r) => r.id !== photoId);
      const onboarded = user !== undefined && user.status !== 'pending';
      if (onboarded && counts(target) && rest.filter(counts).length < LIMITS.photosMin) {
        throw new DomainError(
          ErrorCode.PHOTO_MINIMUM,
          `Your profile needs at least ${LIMITS.photosMin} photos. Add another before removing this one.`,
          { status: 409 },
        );
      }
      await this.repo.delete([target.id], t);
      await this.repo.setPositions(
        rest.map((r) => r.id),
        t,
      );
      return target;
    });
    this.deleteObjects([removed.storageKey]);
  }

  private async toDto(row: ProfilePhotoRow): Promise<PhotoDto> {
    return {
      id: row.id,
      position: row.position,
      status: row.status,
      url:
        row.status === 'uploading'
          ? null
          : await this.storage.presignDownload(row.storageKey, DOWNLOAD_URL_TTL_SECONDS),
      width: row.width,
      height: row.height,
      rejectionReason: row.rejectionReason,
    };
  }

  /** Best effort, after the database change committed. A failure leaves an orphan, never a dangling row. */
  private deleteObjects(keys: readonly string[]): void {
    for (const key of keys) {
      this.storage.delete(key).catch((error: unknown) => {
        this.logger.warn(`Could not delete photo object: ${String(error)}`);
      });
    }
  }
}
