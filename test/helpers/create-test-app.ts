import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiModule } from '@/api.module';
import { configureApp } from '@/bootstrap/configure-app';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';
import { DB_POOL } from '@/infra/database/database.module';
import { REDIS } from '@/infra/redis/redis.module';

export const TEST_CONFIG: AppConfig = {
  APP_ENV: 'local',
  NODE_ENV: 'test',
  APP_MODE: 'api',
  PORT: 0,
  LOG_LEVEL: 'silent',
  APP_VERSION: 'test',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  CORS_ORIGINS: [],
  MIN_APP_VERSION: '1.2.0',
};

export interface FakeInfraState {
  dbHealthy: boolean;
  redisHealthy: boolean;
}

/**
 * Builds the real API module exactly as production wires it (global pipe, filter, interceptors,
 * prefix, helmet, OpenAPI), with only Postgres and Redis replaced by in-memory fakes so these
 * tests need no Docker. Integration tests against real Postgres/Redis live in test/integration.
 */
export async function createTestApp(
  initial: Partial<FakeInfraState> = {},
): Promise<{ app: INestApplication; infra: FakeInfraState }> {
  const infra: FakeInfraState = { dbHealthy: true, redisHealthy: true, ...initial };

  const fakePool = {
    query: async () => {
      if (!infra.dbHealthy) throw new Error('database down');
      return { rows: [{ '?column?': 1 }] };
    },
    end: async () => undefined,
    on: () => undefined,
  };

  const fakeRedis = {
    ping: async () => {
      if (!infra.redisHealthy) throw new Error('redis down');
      return 'PONG';
    },
    connect: async () => undefined,
    quit: async () => 'OK',
    disconnect: () => undefined,
    on: () => undefined,
  };

  const moduleRef = await Test.createTestingModule({ imports: [ApiModule] })
    .overrideProvider(APP_CONFIG)
    .useValue(TEST_CONFIG)
    .overrideProvider(DB_POOL)
    .useValue(fakePool)
    .overrideProvider(REDIS)
    .useValue(fakeRedis)
    .compile();

  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app, TEST_CONFIG);
  await app.init();
  return { app, infra };
}
