import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from '@/common/utils/uuid';
import { matches } from './matching';
import { users } from './users';

/**
 * One conversation per match, sharing the match's id. Created on the first message; until then
 * the chat list shows the match itself. Closed when the match ends (matches.unmatched_at).
 */
export const conversations = pgTable('conversations', {
  id: uuid('id')
    .primaryKey()
    .references(() => matches.id, { onDelete: 'cascade' }),
  lastMessageId: uuid('last_message_id'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Text messages. Ordered by `id` (UUIDv7). `client_msg_id` makes sends idempotent. Partitioning by
 * month comes when volume needs it (discussion log D-33).
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    /** Null once the sender deletes their account; the other person keeps the history. */
    senderId: uuid('sender_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    clientMsgId: uuid('client_msg_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('messages_client_msg').on(t.conversationId, t.clientMsgId),
    index('messages_conversation_idx').on(t.conversationId, t.id.desc()),
    check('messages_body_len', sql`char_length(${t.body}) BETWEEN 1 AND 2000`),
  ],
);

/** How far each person has read. Drives unread counts (and read receipts once settings exist). */
export const conversationReads = pgTable(
  'conversation_reads',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadMessageId: uuid('last_read_message_id').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

/** A member's app installs, for push notifications. */
export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The app's own install id (same as in the session). */
    deviceId: text('device_id').notNull(),
    platform: text('platform').notNull(),
    pushProvider: text('push_provider').notNull(),
    /** One token belongs to one member: signing in as someone else on the phone moves it. */
    pushToken: text('push_token').notNull().unique(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('devices_user_device').on(t.userId, t.deviceId)],
);

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type DeviceRow = typeof devices.$inferSelect;
