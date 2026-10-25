import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { ApiModule } from '@/api.module';
import { configureApp } from '@/bootstrap/configure-app';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';
import { MAIL_PROVIDER, type MailMessage, type MailProvider } from '@/infra/mail/mail.module';
import { TEST_CONFIG } from '../../helpers/create-test-app';

/**
 * Integration tests run the real API against real Postgres (PostGIS) and Redis from
 * `docker compose up -d`, in a separate database and Redis db so dev data is untouched.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://flinger:flinger@localhost:5432/flinger_test';
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';

export class CapturingMail implements MailProvider {
  sent: MailMessage[] = [];
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
  /** The last code emailed to `to`. */
  codeFor(to: string): string {
    const message = [...this.sent].reverse().find((m) => m.to === to);
    const match = /code is (\d{6})/.exec(message?.text ?? '');
    if (!match) throw new Error(`no code was emailed to ${to}`);
    return match[1];
  }
}

async function ensureDatabase(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const database = url.pathname.slice(1);
  url.pathname = '/postgres';
  const admin = new Pool({ connectionString: url.toString(), max: 1 });
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${database}"`);
  } finally {
    await admin.end();
  }
  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: path.resolve(__dirname, '../../../drizzle') });
  } finally {
    await pool.end();
  }
}

export interface IntegrationContext {
  app: INestApplication;
  moduleRef: TestingModule;
  mail: CapturingMail;
  db: Pool;
  redis: Redis;
  /** Wipe all rows and Redis keys between tests. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

export async function createIntegrationApp(
  overrides: Partial<AppConfig> = {},
): Promise<IntegrationContext> {
  await ensureDatabase();

  const config: AppConfig = {
    ...TEST_CONFIG,
    DATABASE_URL: TEST_DATABASE_URL,
    REDIS_URL: TEST_REDIS_URL,
    OTP_RESEND_COOLDOWN_SECONDS: 0,
    ...overrides,
  };
  const mail = new CapturingMail();

  const moduleRef = await Test.createTestingModule({ imports: [ApiModule] })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .overrideProvider(MAIL_PROVIDER)
    .useValue(mail)
    .compile();

  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app, config);
  await app.init();

  const db = new Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
  const redis = new Redis(TEST_REDIS_URL);

  return {
    app,
    moduleRef,
    mail,
    db,
    redis,
    async reset() {
      await db.query('TRUNCATE users RESTART IDENTITY CASCADE');
      await redis.flushdb();
      mail.sent = [];
    },
    async close() {
      await app.close();
      await db.end();
      redis.disconnect();
    },
  };
}
