import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { Emitter } from '@socket.io/redis-emitter';
import type Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';
import { REDIS } from '@/infra/redis/redis.module';
import { redisKey } from '@/infra/redis/redis-keys';

/** Socket.IO namespace the apps connect to. */
export const CHAT_NAMESPACE = '/chat';
/** Room with every socket of one member, on any realtime node. */
export const userRoom = (userId: string) => `user:${userId}`;

/** Events the server sends to apps. Payloads carry no secrets; message bodies only to participants. */
export type ServerEvent = 'message:new' | 'match:new' | 'match:ended' | 'typing' | 'read';

/**
 * Send realtime events from any process (API, worker, realtime). Goes through Redis to the
 * Socket.IO adapter, which delivers to the member's sockets on whichever node they are connected.
 */
@Injectable()
export class RealtimeEmitter {
  private readonly emitter: Emitter;

  constructor(@Inject(REDIS) redis: Redis) {
    this.emitter = new Emitter(redis).of(CHAT_NAMESPACE);
  }

  toUser(userId: string, event: ServerEvent, payload: unknown): void {
    this.emitter.to(userRoom(userId)).emit(event, payload);
  }
}

const PRESENCE_TTL_MS = 70_000;

/**
 * Who has the app open (a live socket). A sorted set of socket ids per member, scored by expiry,
 * refreshed by the realtime node's heartbeat; crashed nodes simply stop refreshing.
 */
@Injectable()
export class Presence {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async touch(userId: string, socketId: string): Promise<void> {
    const key = this.key(userId);
    await this.redis
      .multi()
      .zadd(key, Date.now() + PRESENCE_TTL_MS, socketId)
      .pexpire(key, PRESENCE_TTL_MS * 2)
      .exec();
  }

  async leave(userId: string, socketId: string): Promise<void> {
    await this.redis.zrem(this.key(userId), socketId);
  }

  async isOnline(userId: string): Promise<boolean> {
    const key = this.key(userId);
    await this.redis.zremrangebyscore(key, 0, Date.now());
    return (await this.redis.zcard(key)) > 0;
  }

  private key(userId: string): string {
    return redisKey(this.config.APP_ENV, 'presence', userId);
  }
}

@Global()
@Module({
  providers: [RealtimeEmitter, Presence],
  exports: [RealtimeEmitter, Presence],
})
export class RealtimeInfraModule {}
