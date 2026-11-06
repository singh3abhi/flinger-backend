import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from '@/common/utils/uuid';
import { users } from './users';

/** I blocked them. The effect is mutual: neither sees the other anywhere. */
export const blocks = pgTable(
  'blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    // "Has anyone blocked me" lookups (the effect is mutual).
    index('blocks_blocked_idx').on(t.blockedId),
    check('blocks_not_self', sql`${t.blockerId} <> ${t.blockedId}`),
  ],
);

export const reportTarget = pgEnum('report_target', ['user', 'photo', 'prompt', 'message']);
export const reportReason = pgEnum('report_reason', [
  'fake_or_spam',
  'inappropriate',
  'harassment_or_hate',
  'underage',
  'scam',
  'other',
]);
export const reportStatus = pgEnum('report_status', ['open', 'dismissed', 'actioned']);

/**
 * Reports for moderators. `snapshot` keeps what was reported (the photo key, the prompt text, the
 * last messages) so evidence survives the reported person editing or deleting it.
 */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    reportedId: uuid('reported_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: reportTarget('target_type').notNull(),
    targetId: uuid('target_id'),
    reason: reportReason('reason').notNull(),
    details: text('details'),
    snapshot: jsonb('snapshot'),
    status: reportStatus('status').notNull().default('open'),
    resolvedBy: text('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reports_open_idx')
      .on(t.status, t.createdAt)
      .where(sql`${t.status} = 'open'`),
    index('reports_reported_idx').on(t.reportedId),
    check('reports_details_len', sql`char_length(${t.details}) <= 1000`),
  ],
);

export type ReportRow = typeof reports.$inferSelect;
