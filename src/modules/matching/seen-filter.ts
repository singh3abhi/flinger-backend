import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';
import { REDIS } from '@/infra/redis/redis.module';
import { redisKey } from '@/infra/redis/redis-keys';
import { bitPositions, sliceParams } from './bloom';

/** Pipeline results, failing loudly: a silently dropped SETBIT would make the filter forget. */
function checked(results: [Error | null, unknown][] | null): unknown[] {
  return (results ?? []).map(([error, value]) => {
    if (error) throw error;
    return value;
  });
}

interface Meta {
  seed: string;
  /** Ids added to each slice so far. */
  counts: number[];
}

/**
 * Per-member "already seen" filter (liked, passed or matched), as a scalable Bloom filter on plain
 * Redis bitmaps. Never says "not seen" for someone seen; about 1% of unseen people may be skipped.
 * Postgres stays the truth: a lost filter is rebuilt from it. Safety rules (blocks) never use this.
 */
@Injectable()
export class SeenFilter {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Record ids as seen. Builds the filter first if Redis lost it. */
  async add(
    userId: string,
    ids: readonly string[],
    rebuild: () => Promise<string[]>,
  ): Promise<void> {
    const meta = await this.ensure(userId, rebuild);
    await this.write(userId, meta, ids);
  }

  /** The ids from `ids` this member has not seen (as far as the filter can tell). */
  async unseen(
    userId: string,
    ids: readonly string[],
    rebuild: () => Promise<string[]>,
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const meta = await this.ensure(userId, rebuild);
    const pipeline = this.redis.pipeline();
    const plan = ids.map((id) =>
      meta.counts.map((_, slice) => {
        const positions = bitPositions(meta.seed, id, sliceParams(slice));
        for (const bit of positions) pipeline.getbit(this.sliceKey(userId, meta.seed, slice), bit);
        return positions.length;
      }),
    );
    const bits = checked(await pipeline.exec()).map((value) => value === 1);
    let cursor = 0;
    return ids.filter((_, i) => {
      let seen = false;
      for (const length of plan[i]) {
        const sliceBits = bits.slice(cursor, cursor + length);
        cursor += length;
        if (sliceBits.every(Boolean)) seen = true;
      }
      return !seen;
    });
  }

  /** Throw the filter away; the next use rebuilds it from Postgres with a new seed (e.g. after unblocking). */
  async reset(userId: string): Promise<void> {
    const raw = await this.redis.get(this.metaKey(userId));
    if (!raw) return;
    const meta = JSON.parse(raw) as Meta;
    await this.redis.del(
      this.metaKey(userId),
      ...meta.counts.map((_, slice) => this.sliceKey(userId, meta.seed, slice)),
    );
  }

  private async ensure(userId: string, rebuild: () => Promise<string[]>): Promise<Meta> {
    const raw = await this.redis.get(this.metaKey(userId));
    if (raw) return JSON.parse(raw) as Meta;
    const meta: Meta = { seed: randomBytes(8).toString('hex'), counts: [0] };
    await this.write(userId, meta, await rebuild());
    return meta;
  }

  /**
   * Counts are read-modify-write: two simultaneous adds for one member can undercount a slice,
   * which only lets it fill slightly past capacity (a marginally higher false-positive rate).
   */
  private async write(userId: string, meta: Meta, ids: readonly string[]): Promise<void> {
    if (ids.length > 0) {
      const pipeline = this.redis.pipeline();
      for (const id of ids) {
        let slice = meta.counts.length - 1;
        if (meta.counts[slice] >= sliceParams(slice).capacity) {
          meta.counts.push(0);
          slice += 1;
        }
        for (const bit of bitPositions(meta.seed, id, sliceParams(slice))) {
          pipeline.setbit(this.sliceKey(userId, meta.seed, slice), bit, 1);
        }
        meta.counts[slice] += 1;
      }
      checked(await pipeline.exec());
    }
    await this.redis.set(this.metaKey(userId), JSON.stringify(meta));
  }

  private metaKey(userId: string): string {
    return redisKey(this.config.APP_ENV, 'disc', 'seen-meta', userId);
  }

  /** Bitmaps are keyed by seed, so a rebuild never mixes with the old bits. */
  private sliceKey(userId: string, seed: string, slice: number): string {
    return redisKey(this.config.APP_ENV, 'disc', 'seen', userId, seed, slice);
  }
}
