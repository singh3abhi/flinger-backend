import { index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from '@/common/utils/uuid';
import { users } from './users';

export const identityProvider = pgEnum('identity_provider', ['phone', 'email', 'apple', 'google']);

/**
 * How a person proves who they are. One account per phone number and per email:
 * (provider, subject) is globally unique, and a user has at most one identity per provider.
 * Emails are stored lowercased and trimmed; phones in E.164.
 */
export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: identityProvider('provider').notNull(),
    subject: text('subject').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('auth_identities_provider_subject_uq').on(table.provider, table.subject),
    unique('auth_identities_user_provider_uq').on(table.userId, table.provider),
  ],
);

/**
 * Refresh tokens are opaque random strings; only their SHA-256 hash is stored.
 * Each rotation creates a new row in the same family. Presenting a token that was already
 * rotated means it leaked, so the whole family is revoked (docs/05-auth-and-security.md).
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    deviceId: text('device_id'),
    platform: text('platform'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedBy: uuid('replaced_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('refresh_tokens_family_idx').on(table.familyId),
    index('refresh_tokens_user_idx').on(table.userId),
  ],
);

export type AuthIdentityRow = typeof authIdentities.$inferSelect;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
