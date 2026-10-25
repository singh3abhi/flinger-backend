/**
 * Applies SQL migrations from ./drizzle. Run as a one-off task before each rollout
 * (`pnpm db:migrate`). Uses MIGRATION_DATABASE_URL (a role allowed to alter the schema) when set,
 * falling back to DATABASE_URL for local development.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function main(): Promise<void> {
  // Local development keeps DATABASE_URL in .env (deployed environments inject it directly).
  if (existsSync('.env')) process.loadEnvFile('.env');
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Set DATABASE_URL (or MIGRATION_DATABASE_URL) to run migrations.');
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: path.resolve(__dirname, '../../../drizzle') });
    console.log('Migrations applied.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
