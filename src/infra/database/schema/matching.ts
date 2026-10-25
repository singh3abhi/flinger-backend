import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from '@/common/utils/uuid';
import { users } from './users';

export const swipeDirection = pgEnum('swipe_direction', ['like', 'pass']);
export const likeItemType = pgEnum('like_item_type', ['photo', 'prompt']);

/**
 * One decision per pair: I liked or passed on them. A like points at the photo or prompt it was
 * sent from, with an optional comment (Hinge-style). Unique per pair, so retries are harmless.
 */
export const swipes = pgTable(
  'swipes',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    swiperId: uuid('swiper_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    direction: swipeDirection('direction').notNull(),
    itemType: likeItemType('item_type'),
    /** The liked photo (profile_photos.id) or prompt answer (profile_prompts.id). */
    itemId: uuid('item_id'),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('swipes_pair').on(t.swiperId, t.targetId),
    // "Who liked me" and match detection.
    index('swipes_likes_received_idx')
      .on(t.targetId, t.createdAt)
      .where(sql`${t.direction} = 'like'`),
    check('swipes_not_self', sql`${t.swiperId} <> ${t.targetId}`),
    check(
      'swipes_like_has_item',
      sql`(${t.direction} = 'like') = (${t.itemType} IS NOT NULL AND ${t.itemId} IS NOT NULL)`,
    ),
    check('swipes_comment_len', sql`char_length(${t.comment}) <= 150`),
  ],
);

/** A mutual like. The pair is stored ordered (user_a < user_b) so it exists exactly once. */
export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    userA: uuid('user_a')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userB: uuid('user_b')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    unmatchedAt: timestamp('unmatched_at', { withTimezone: true }),
    unmatchedBy: uuid('unmatched_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    unique('matches_pair').on(t.userA, t.userB),
    check('matches_ordered_pair', sql`${t.userA} < ${t.userB}`),
    index('matches_user_b_idx').on(t.userB),
  ],
);

export type SwipeRow = typeof swipes.$inferSelect;
export type MatchRow = typeof matches.$inferSelect;
