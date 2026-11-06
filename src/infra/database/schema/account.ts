import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from '@/common/utils/uuid';
import { users } from './users';

export const exportStatus = pgEnum('export_status', ['pending', 'ready', 'failed']);

/** "Download my data" requests. The file lives in private object storage until `expires_at`. */
export const dataExports = pgTable('data_exports', {
  id: uuid('id').primaryKey().$defaultFn(uuidv7),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: exportStatus('status').notNull().default('pending'),
  storageKey: text('storage_key'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type DataExportRow = typeof dataExports.$inferSelect;
