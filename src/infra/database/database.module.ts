import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';
import * as schema from './schema';

export const DB_POOL = Symbol('DB_POOL');
export const DRIZZLE = Symbol('DRIZZLE');

export type Database = NodePgDatabase<typeof schema>;
/** Accepts either the database or a transaction handle: repository methods take this. */
export type Executor = PgDatabase<NodePgQueryResultHKT, typeof schema>;
/** The handle passed to repository methods inside a transaction. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

@Global()
@Module({
  providers: [
    {
      provide: DB_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Pool => {
        const logger = new Logger('Database');
        // The pool connects lazily: the app can boot (and /health can answer) while Postgres is down.
        const pool = new Pool({
          connectionString: config.DATABASE_URL,
          max: 10,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
        });
        pool.on('error', (err) => logger.error({ err }, 'Idle Postgres client error'));
        return pool;
      },
    },
    {
      provide: DRIZZLE,
      inject: [DB_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
  ],
  exports: [DB_POOL, DRIZZLE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end().catch(() => undefined);
  }
}
