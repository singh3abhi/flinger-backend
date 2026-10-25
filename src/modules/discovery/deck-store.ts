import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';
import { REDIS } from '@/infra/redis/redis.module';
import { redisKey } from '@/infra/redis/redis-keys';

const DECK_TTL_SECONDS = 24 * 3600;
/** Profiles served in the deck stay openable for a week. */
const SHOWN_TTL_SECONDS = 7 * 24 * 3600;

export interface DeckMeta {
  radiusKm: number;
  widened: boolean;
}

/**
 * The precomputed deck (a Redis list, rebuildable) and the set of people already served, which is
 * what allows GET /profiles/{id}. Losing either only costs a refill.
 */
@Injectable()
export class DeckStore {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async size(userId: string): Promise<number> {
    return this.redis.llen(this.key('deck', userId));
  }

  /** Replace the deck. */
  async replace(userId: string, ids: readonly string[], meta: DeckMeta): Promise<void> {
    const deck = this.key('deck', userId);
    const multi = this.redis.multi().del(deck);
    if (ids.length > 0) multi.rpush(deck, ...ids).expire(deck, DECK_TTL_SECONDS);
    multi.set(this.key('deck-meta', userId), JSON.stringify(meta), 'EX', DECK_TTL_SECONDS);
    await multi.exec();
  }

  async meta(userId: string): Promise<DeckMeta | null> {
    const raw = await this.redis.get(this.key('deck-meta', userId));
    return raw ? (JSON.parse(raw) as DeckMeta) : null;
  }

  /** Take up to `count` ids from the front of the deck. */
  async take(userId: string, count: number): Promise<string[]> {
    return (await this.redis.lpop(this.key('deck', userId), count)) ?? [];
  }

  async markShown(userId: string, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const shown = this.key('shown', userId);
    await this.redis
      .multi()
      .sadd(shown, ...ids)
      .expire(shown, SHOWN_TTL_SECONDS)
      .exec();
  }

  async wasShown(userId: string, otherId: string): Promise<boolean> {
    return (await this.redis.sismember(this.key('shown', userId), otherId)) === 1;
  }

  private key(kind: string, userId: string): string {
    return redisKey(this.config.APP_ENV, 'disc', kind, userId);
  }
}
