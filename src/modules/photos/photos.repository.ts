import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, type Database, type Executor } from '@/infra/database/database.module';
import { profilePhotos, type ProfilePhotoRow } from '@/infra/database/schema';

type NewPhoto = Pick<ProfilePhotoRow, 'id' | 'userId' | 'storageKey' | 'position' | 'contentType'> &
  Partial<Pick<ProfilePhotoRow, 'byteSize'>>;

/** The only place that touches `profile_photos`. */
@Injectable()
export class PhotosRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  list(userId: string, executor: Executor = this.db): Promise<ProfilePhotoRow[]> {
    return executor
      .select()
      .from(profilePhotos)
      .where(eq(profilePhotos.userId, userId))
      .orderBy(asc(profilePhotos.position));
  }

  /** Lock the member's photo rows for the rest of the transaction (serialises slot changes). */
  async listForUpdate(userId: string, tx: Executor): Promise<ProfilePhotoRow[]> {
    return tx
      .select()
      .from(profilePhotos)
      .where(eq(profilePhotos.userId, userId))
      .orderBy(asc(profilePhotos.position))
      .for('update');
  }

  async find(userId: string, photoId: string, executor: Executor = this.db) {
    const [row] = await executor
      .select()
      .from(profilePhotos)
      .where(and(eq(profilePhotos.id, photoId), eq(profilePhotos.userId, userId)))
      .limit(1);
    return row;
  }

  async insert(photo: NewPhoto, tx: Executor): Promise<ProfilePhotoRow> {
    const [row] = await tx.insert(profilePhotos).values(photo).returning();
    return row;
  }

  async update(
    photoId: string,
    changes: Partial<
      Pick<
        ProfilePhotoRow,
        'status' | 'byteSize' | 'width' | 'height' | 'rejectionReason' | 'uploadedAt'
      >
    >,
    executor: Executor = this.db,
  ): Promise<ProfilePhotoRow> {
    const [row] = await executor
      .update(profilePhotos)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(profilePhotos.id, photoId))
      .returning();
    return row;
  }

  async delete(photoIds: readonly string[], tx: Executor): Promise<void> {
    if (photoIds.length === 0) return;
    await tx.delete(profilePhotos).where(inArray(profilePhotos.id, [...photoIds]));
  }

  /** Give the photos positions 1..n in the given order. Uniqueness is checked at commit. */
  async setPositions(orderedIds: readonly string[], tx: Executor): Promise<void> {
    await tx.execute(sql`SET CONSTRAINTS profile_photos_user_position DEFERRED`);
    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(profilePhotos)
        .set({ position: index + 1, updatedAt: new Date() })
        .where(eq(profilePhotos.id, id));
    }
  }

  /** Approved photos of several members, in order. */
  listApproved(
    userIds: readonly string[],
    executor: Executor = this.db,
  ): Promise<ProfilePhotoRow[]> {
    if (userIds.length === 0) return Promise.resolve([]);
    return executor
      .select()
      .from(profilePhotos)
      .where(and(inArray(profilePhotos.userId, [...userIds]), eq(profilePhotos.status, 'approved')))
      .orderBy(asc(profilePhotos.userId), asc(profilePhotos.position));
  }
}
