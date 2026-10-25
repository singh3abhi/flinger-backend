import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
import { DB_POOL } from '@/infra/database/database.module';
import { REDIS } from '@/infra/redis/redis.module';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    @Inject(DB_POOL) private readonly pool: Pool,
  ) {}

  async isHealthy(key: string) {
    const check = this.indicator.check(key);
    try {
      await this.pool.query('SELECT 1');
      return check.up();
    } catch {
      return check.down({ message: 'unreachable' });
    }
  }
}

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async isHealthy(key: string) {
    const check = this.indicator.check(key);
    try {
      const reply = await this.redis.ping();
      return reply === 'PONG' ? check.up() : check.down({ message: 'bad reply' });
    } catch {
      return check.down({ message: 'unreachable' });
    }
  }
}
