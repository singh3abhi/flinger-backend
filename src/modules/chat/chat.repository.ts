import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type Database, type Executor } from '@/infra/database/database.module';
import {
  conversationReads,
  conversations,
  messages,
  type MessageRow,
} from '@/infra/database/schema';

export type ConversationListRow = {
  id: string;
  other_id: string;
  matched_at: Date;
  activity_at: Date;
  last_id: string | null;
  last_body: string | null;
  last_sender_id: string | null;
  last_at: Date | null;
  unread: number;
};

/**
 * The only place that writes conversations, messages and read state. The conversation list reads
 * `matches` too (one query), the same read-only exception as the discovery candidates.
 */
@Injectable()
export class ChatRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Current matches with their last message and my unread count, most recent activity first. */
  async listConversations(
    userId: string,
    limit: number,
    cursor?: { at: Date; id: string },
  ): Promise<ConversationListRow[]> {
    const { rows } = await this.db.execute<ConversationListRow>(sql`
      SELECT m.id,
             CASE WHEN m.user_a = ${userId} THEN m.user_b ELSE m.user_a END AS other_id,
             m.created_at AS matched_at,
             coalesce(c.last_message_at, m.created_at) AS activity_at,
             lm.id AS last_id, lm.body AS last_body, lm.sender_id AS last_sender_id, lm.created_at AS last_at,
             (SELECT count(*)::int FROM messages x
               WHERE x.conversation_id = m.id
                 AND x.sender_id IS DISTINCT FROM ${userId}
                 AND (r.last_read_message_id IS NULL OR x.id > r.last_read_message_id)) AS unread
      FROM matches m
      LEFT JOIN conversations c ON c.id = m.id
      LEFT JOIN messages lm ON lm.id = c.last_message_id
      LEFT JOIN conversation_reads r ON r.conversation_id = m.id AND r.user_id = ${userId}
      WHERE (m.user_a = ${userId} OR m.user_b = ${userId})
        AND m.unmatched_at IS NULL
        ${
          cursor
            ? sql`AND (coalesce(c.last_message_at, m.created_at), m.id) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)`
            : sql``
        }
      ORDER BY activity_at DESC, m.id DESC
      LIMIT ${limit}`);
    return rows;
  }

  async ensureConversation(conversationId: string, tx: Executor): Promise<void> {
    await tx.insert(conversations).values({ id: conversationId }).onConflictDoNothing();
  }

  /** Insert unless this client message was already stored. Returns the row and whether it's new. */
  async insertMessage(
    message: Pick<MessageRow, 'conversationId' | 'senderId' | 'body' | 'clientMsgId'>,
    tx: Executor,
  ): Promise<{ row: MessageRow; created: boolean }> {
    const [created] = await tx.insert(messages).values(message).onConflictDoNothing().returning();
    if (created) return { row: created, created: true };
    const [existing] = await tx
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, message.conversationId),
          eq(messages.clientMsgId, message.clientMsgId),
        ),
      )
      .limit(1);
    return { row: existing, created: false };
  }

  async setLastMessage(conversationId: string, message: MessageRow, tx: Executor): Promise<void> {
    await tx
      .update(conversations)
      .set({ lastMessageId: message.id, lastMessageAt: message.createdAt })
      .where(eq(conversations.id, conversationId));
  }

  /**
   * A page of messages, oldest first. `before`: older history (scrolling up). `after`: everything
   * since a message the app already has (gap-fill after a reconnect). The `after` window starts a few
   * seconds early because ids from different servers in the same instant may not be in order; the
   * app drops duplicates by id.
   */
  async listMessages(
    conversationId: string,
    page: { before?: string; after?: string; limit: number },
  ): Promise<MessageRow[]> {
    if (page.after) {
      const { rows } = await this.db.execute<{ id: string }>(sql`
        SELECT id FROM messages
        WHERE conversation_id = ${conversationId}
          AND created_at >= (SELECT created_at - interval '5 seconds' FROM messages WHERE id = ${page.after}::uuid)
        ORDER BY id ASC
        LIMIT ${page.limit}`);
      return this.byIds(rows.map((r) => r.id));
    }
    const rows = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          page.before ? sql`${messages.id} < ${page.before}::uuid` : undefined,
        ),
      )
      .orderBy(sql`${messages.id} DESC`)
      .limit(page.limit);
    return rows.reverse();
  }

  async findMessage(conversationId: string, messageId: string): Promise<MessageRow | undefined> {
    const [row] = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
      .limit(1);
    return row;
  }

  /** Move my read position forward (never back). */
  async markRead(
    conversationId: string,
    userId: string,
    messageId: string,
    executor: Executor = this.db,
  ) {
    await executor
      .insert(conversationReads)
      .values({ conversationId, userId, lastReadMessageId: messageId })
      .onConflictDoUpdate({
        target: [conversationReads.conversationId, conversationReads.userId],
        set: {
          lastReadMessageId: sql`GREATEST(${conversationReads.lastReadMessageId}, excluded.last_read_message_id)`,
          readAt: new Date(),
        },
      });
  }

  /** Conversations with unread messages, for the tab badge. */
  async unreadConversations(userId: string): Promise<number> {
    const { rows } = await this.db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n
      FROM matches m
      JOIN conversations c ON c.id = m.id
      JOIN messages lm ON lm.id = c.last_message_id
      LEFT JOIN conversation_reads r ON r.conversation_id = m.id AND r.user_id = ${userId}
      WHERE (m.user_a = ${userId} OR m.user_b = ${userId})
        AND m.unmatched_at IS NULL
        AND lm.sender_id IS DISTINCT FROM ${userId}
        AND (r.last_read_message_id IS NULL OR lm.id > r.last_read_message_id)`);
    return rows[0]?.n ?? 0;
  }

  private async byIds(ids: string[]): Promise<MessageRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(messages)
      .where(
        sql`${messages.id} IN (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      )
      .orderBy(sql`${messages.id} ASC`);
  }
}
