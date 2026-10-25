import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';
import { REDIS } from './redis.module';
import { redisKey } from './redis-keys';

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets (0 when allowed). */
  retryAfterSeconds: number;
}

/** Fixed-window counters in Redis. Fail-safe: a counter can never be left without an expiry. */
@Injectable()
export class RateLimiter {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Count one hit for `scope:id` and report whether it is still within `limit` per window. */
  async hit(
    scope: string,
    id: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const key = redisKey(this.config.APP_ENV, 'rl', scope, id);
    const count = await this.redis.incr(key);
    let ttl = await this.redis.ttl(key);
    if (count === 1 || ttl < 0) {
      // First hit, or a counter that lost its expiry (crash between INCR and EXPIRE).
      await this.redis.expire(key, windowSeconds);
      ttl = windowSeconds;
    }
    if (count <= limit) return { allowed: true, retryAfterSeconds: 0 };
    return { allowed: false, retryAfterSeconds: Math.max(ttl, 1) };
  }
}
