import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from '@/common/utils/uuid';
import { users } from './users';

/**
 * uploading: slot reserved, bytes not confirmed yet · pending: uploaded, waiting for review ·
 * approved: visible to others · rejected: hidden, with a reason, until the member removes it.
 */
export const photoStatus = pgEnum('photo_status', ['uploading', 'pending', 'approved', 'rejected']);

/** Photo metadata. The bytes live in object storage under `storage_key`. */
export const profilePhotos = pgTable(
  'profile_photos',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull().unique(),
    /** 1 is the main photo. Unique per member (deferrable, so reordering can swap positions). */
    position: smallint('position').notNull(),
    status: photoStatus('status').notNull().default('uploading'),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size'),
    width: smallint('width'),
    height: smallint('height'),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('profile_photos_user_position').on(t.userId, t.position),
    check('profile_photos_position_range', sql`${t.position} BETWEEN 1 AND 6`),
    index('profile_photos_status_idx')
      .on(t.status, t.createdAt)
      .where(sql`${t.status} IN ('uploading', 'pending')`),
  ],
);

export type ProfilePhotoRow = typeof profilePhotos.$inferSelect;
