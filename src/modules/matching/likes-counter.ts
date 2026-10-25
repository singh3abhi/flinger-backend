import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';
import { REDIS } from '@/infra/redis/redis.module';
import { redisKey } from '@/infra/redis/redis-keys';
import { likesWindow, type LikesWindow } from './likes-window';

/** Counters outlive their window a little, then expire on their own. */
const COUNTER_TTL_SECONDS = 36 * 3600;

/** Likes used in the current daily window (resets 04:00 IST). Redis INCR keeps it atomic. */
@Injectable()
export class LikesCounter {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Use one like if any are left. */
  async take(
    userId: string,
    perDay: number,
  ): Promise<{ allowed: boolean; used: number; window: LikesWindow }> {
    const window = likesWindow();
    const key = this.key(userId, window);
    const used = await this.redis.incr(key);
    if (used === 1) await this.redis.expire(key, COUNTER_TTL_SECONDS);
    if (used > perDay) {
      await this.redis.decr(key);
      return { allowed: false, used: perDay, window };
    }
    return { allowed: true, used, window };
  }

  /** Return a like that turned out not to be needed (a retry of one already counted). */
  async giveBack(userId: string): Promise<void> {
    await this.redis.decr(this.key(userId, likesWindow()));
  }

  async used(userId: string): Promise<{ used: number; window: LikesWindow }> {
    const window = likesWindow();
    return { used: Number((await this.redis.get(this.key(userId, window))) ?? 0), window };
  }

  private key(userId: string, window: LikesWindow): string {
    return redisKey(this.config.APP_ENV, 'likes', 'count', userId, window.id);
  }
}
