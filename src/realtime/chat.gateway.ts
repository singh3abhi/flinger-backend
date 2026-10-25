import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { z } from 'zod';
import { DomainError } from '@/common/errors/domain-error';
import { ErrorCode } from '@/common/errors/error-codes';
import { LIMITS } from '@/common/limits';
import { CHAT_NAMESPACE, Presence, userRoom } from '@/infra/realtime/realtime.module';
import { AuthService } from '@/modules/auth';
import { ChatService } from '@/modules/chat';

const HEARTBEAT_MS = 30_000;
const TYPING_EVERY_MS = 2_000;

const sendSchema = z.object({
  conversationId: z.uuid(),
  clientMsgId: z.uuid(),
  body: z.string().trim().min(1).max(LIMITS.messageMaxLength),
});
const readSchema = z.object({ conversationId: z.uuid(), upToMessageId: z.uuid() });
const typingSchema = z.object({ conversationId: z.uuid() });

interface SocketData {
  userId: string;
  /** Access token expiry (ms). After it, events are refused and the app reconnects with a new one. */
  expiresAt: number;
  heartbeat?: NodeJS.Timeout;
  lastTypingAt?: number;
}

type Ack = { ok: true; [key: string]: unknown } | { ok: false; code: string; message: string };

const failureLogger = new Logger('ChatGateway');

function failure(error: unknown): Ack {
  if (error instanceof DomainError) return { ok: false, code: error.code, message: error.message };
  if (error instanceof z.ZodError) {
    return { ok: false, code: ErrorCode.VALIDATION_FAILED, message: 'Please check what you sent.' };
  }
  // Unexpected: log the error (never the event payload, which may hold a message).
  failureLogger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  return { ok: false, code: ErrorCode.INTERNAL_ERROR, message: 'Something went wrong.' };
}

/**
 * The chat socket (namespace /chat). Auth: the access token in the handshake (`auth.token`).
 * Each member joins `user:{id}`; all server events go to that room. Postgres stays the truth; on
 * reconnect the app gap-fills over REST.
 */
@WebSocketGateway({ namespace: CHAT_NAMESPACE })
export class ChatGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly auth: AuthService,
    private readonly chat: ChatService,
    private readonly presence: Presence,
  ) {}

  afterInit(namespace: Namespace): void {
    namespace.use((socket, next) => {
      void this.authenticate(socket).then(
        () => next(),
        () => next(new Error('UNAUTHORIZED')),
      );
    });
    namespace.on('connection', (socket: Socket) => void this.onConnect(socket));
  }

  handleDisconnect(socket: Socket): void {
    const data = socket.data as Partial<SocketData>;
    if (data.heartbeat) clearInterval(data.heartbeat);
    if (data.userId) void this.presence.leave(data.userId, socket.id).catch(() => undefined);
  }

  @SubscribeMessage('message:send')
  async send(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<Ack> {
    try {
      const userId = this.member(socket);
      const input = sendSchema.parse(body);
      const message = await this.chat.send(
        userId,
        input.conversationId,
        input.clientMsgId,
        input.body,
      );
      return { ok: true, message };
    } catch (error) {
      return failure(error);
    }
  }

  @SubscribeMessage('read')
  async read(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<Ack> {
    try {
      const input = readSchema.parse(body);
      await this.chat.markRead(this.member(socket), input.conversationId, input.upToMessageId);
      return { ok: true };
    } catch (error) {
      return failure(error);
    }
  }

  @SubscribeMessage('typing')
  async typing(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<Ack> {
    try {
      const data = socket.data as SocketData;
      const now = Date.now();
      if (data.lastTypingAt && now - data.lastTypingAt < TYPING_EVERY_MS) return { ok: true };
      data.lastTypingAt = now;
      await this.chat.typing(this.member(socket), typingSchema.parse(body).conversationId);
      return { ok: true };
    } catch (error) {
      return failure(error);
    }
  }

  private async authenticate(socket: Socket): Promise<void> {
    const token = (socket.handshake.auth as { token?: unknown }).token;
    if (typeof token !== 'string') throw new Error('no token');
    const user = await this.auth.authenticateAccessToken(token);
    if (!user) throw new Error('invalid token');
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as {
      exp?: number;
    };
    const data = socket.data as SocketData;
    data.userId = user.id;
    data.expiresAt = (payload.exp ?? 0) * 1000;
  }

  private async onConnect(socket: Socket): Promise<void> {
    const data = socket.data as SocketData;
    await socket.join(userRoom(data.userId));
    await this.presence.touch(data.userId, socket.id).catch(() => undefined);
    data.heartbeat = setInterval(() => {
      void this.presence.touch(data.userId, socket.id).catch(() => undefined);
    }, HEARTBEAT_MS);
    this.logger.debug('socket connected');
  }

  /** The member, as long as their access token is still valid. */
  private member(socket: Socket): string {
    const data = socket.data as SocketData;
    if (!data.userId || Date.now() >= data.expiresAt) {
      socket.disconnect(true);
      throw new DomainError(ErrorCode.UNAUTHORIZED, 'Please reconnect.', { status: 401 });
    }
    return data.userId;
  }
}
