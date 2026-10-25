import { Injectable } from '@nestjs/common';
import { DomainError } from '@/common/errors/domain-error';
import { ErrorCode } from '@/common/errors/error-codes';
import { encodeCursor } from '@/common/pagination';
import type { MessageRow } from '@/infra/database/schema';
import { TransactionManager } from '@/infra/database/transaction.manager';
import { RealtimeEmitter } from '@/infra/realtime/realtime.module';
import { RateLimiter } from '@/infra/redis/rate-limiter.service';
import { MatchingService } from '@/modules/matching';
import { NotificationsService } from '@/modules/notifications';
import { ProfilesService } from '@/modules/profiles';
import { ChatRepository } from './chat.repository';
import type { ConversationListDto, MessagePageDto, MessageView } from './dto/chat.dto';

const MESSAGES_PER_MINUTE = 30;

export function toMessageView(row: MessageRow): MessageView {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    body: row.body,
    clientMsgId: row.clientMsgId,
    createdAt: row.createdAt.toISOString(),
  };
}

function decodeActivityCursor(value?: string): { at: Date; id: string } | undefined {
  if (!value) return undefined;
  const [at, id] = Buffer.from(value, 'base64url').toString('utf8').split('|');
  const date = new Date(at);
  if (!id || Number.isNaN(date.getTime())) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid cursor.', { status: 400 });
  }
  return { at: date, id };
}

/**
 * Conversations between matched members. Postgres is the truth; realtime events and pushes are
 * best-effort extras. Shared by the REST API and the Socket.IO gateway.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly repo: ChatRepository,
    private readonly tx: TransactionManager,
    private readonly matching: MatchingService,
    private readonly profiles: ProfilesService,
    private readonly realtime: RealtimeEmitter,
    private readonly notifications: NotificationsService,
    private readonly rateLimiter: RateLimiter,
  ) {}

  async list(userId: string, limit: number, cursor?: string): Promise<ConversationListDto> {
    const [rows, unreadConversations] = await Promise.all([
      this.repo.listConversations(userId, limit + 1, decodeActivityCursor(cursor)),
      this.repo.unreadConversations(userId),
    ]);
    const page = rows.slice(0, limit);
    const members = await this.profiles.summaries(page.map((r) => r.other_id));
    const items = page.flatMap((r) => {
      const member = members.get(r.other_id);
      if (!member) return [];
      return [
        {
          id: r.id,
          member,
          matchedAt: new Date(r.matched_at).toISOString(),
          lastMessage:
            r.last_id && r.last_body !== null && r.last_at
              ? {
                  id: r.last_id,
                  body: r.last_body,
                  fromMe: r.last_sender_id === userId,
                  createdAt: new Date(r.last_at).toISOString(),
                }
              : null,
          unreadCount: r.unread,
        },
      ];
    });
    const last = page.at(-1);
    return {
      items,
      unreadConversations,
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: new Date(last.activity_at), id: last.id })
          : null,
    };
  }

  async messages(
    userId: string,
    conversationId: string,
    page: { before?: string; after?: string; limit: number },
  ): Promise<MessagePageDto> {
    await this.participant(userId, conversationId);
    const rows = await this.repo.listMessages(conversationId, { ...page, limit: page.limit + 1 });
    if (page.after)
      return {
        items: rows.slice(0, page.limit).map(toMessageView),
        hasMore: rows.length > page.limit,
      };
    const hasMore = rows.length > page.limit;
    return { items: (hasMore ? rows.slice(1) : rows).map(toMessageView), hasMore };
  }

  /** Send (idempotent by clientMsgId). The other person gets it live, or as a push if away. */
  async send(
    userId: string,
    conversationId: string,
    clientMsgId: string,
    body: string,
  ): Promise<MessageView> {
    const otherId = await this.participant(userId, conversationId);
    const limit = await this.rateLimiter.hit('message', userId, MESSAGES_PER_MINUTE, 60);
    if (!limit.allowed) {
      throw new DomainError(ErrorCode.RATE_LIMITED, 'You’re sending messages too fast.', {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfterSeconds) },
      });
    }

    const { row, created } = await this.tx.run(async (t) => {
      await this.repo.ensureConversation(conversationId, t);
      const result = await this.repo.insertMessage(
        { conversationId, senderId: userId, body: body.trim(), clientMsgId },
        t,
      );
      if (result.created) {
        await this.repo.setLastMessage(conversationId, result.row, t);
        await this.repo.markRead(conversationId, userId, result.row.id, t);
      }
      return result;
    });

    const message = toMessageView(row);
    if (created) {
      // Both people's open apps (the sender may have it open on another device too).
      this.realtime.toUser(otherId, 'message:new', message);
      this.realtime.toUser(userId, 'message:new', message);
      void this.pushNewMessage(userId, otherId, conversationId);
    }
    return message;
  }

  /** Best effort, after the message is safely stored: a failure here must not fail the send. */
  private async pushNewMessage(senderId: string, recipientId: string, conversationId: string) {
    try {
      const name = (await this.profiles.displayNames([senderId])).get(senderId);
      this.notifications.notify(recipientId, {
        type: 'new_message',
        // No message text on the lock screen (docs/06 §4); the app loads it when opened.
        title: name ?? 'Flinger',
        body: 'Sent you a message',
        data: { conversationId },
        collapseKey: `conversation:${conversationId}`,
        skipIfOnline: true,
      });
    } catch {
      // Push is optional; the message is already delivered.
    }
  }

  /** I've read up to this message. Unread counts follow; read receipts come with settings (F5). */
  async markRead(userId: string, conversationId: string, upToMessageId: string): Promise<void> {
    await this.participant(userId, conversationId);
    const message = await this.repo.findMessage(conversationId, upToMessageId);
    if (!message) {
      throw new DomainError(ErrorCode.NOT_FOUND, 'Message not found.', { status: 404 });
    }
    await this.repo.markRead(conversationId, userId, upToMessageId);
    this.realtime.toUser(userId, 'read', { conversationId, upToMessageId });
  }

  /** "typing…" is never stored; it just goes to the other person's open app. */
  async typing(userId: string, conversationId: string): Promise<void> {
    const otherId = await this.participant(userId, conversationId);
    this.realtime.toUser(otherId, 'typing', { conversationId, userId });
  }

  /** The other member, if this is a current match of mine. */
  private async participant(userId: string, conversationId: string): Promise<string> {
    const match = await this.matching.activeMatchFor(userId, conversationId);
    if (!match) {
      throw new DomainError(ErrorCode.CONVERSATION_NOT_FOUND, 'This conversation has ended.', {
        status: 404,
      });
    }
    return match.otherId;
  }
}
