import { pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from '@/common/utils/uuid';

export const userStatus = pgEnum('user_status', [
  'pending', // signed in, onboarding not finished
  'active',
  'paused',
  'suspended',
  'deleted',
]);

/** Thin account row. Everything profile-like lives in the `profiles` table (added with onboarding). */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(uuidv7),
  status: userStatus('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type UserRow = typeof users.$inferSelect;
