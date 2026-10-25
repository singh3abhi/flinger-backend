import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit generates SQL migrations into ./drizzle from the schema in src/infra/database/schema.
 * Generated SQL is committed and reviewed like code. Migrations follow expand -> migrate -> contract
 * (docs/07-cicd.md section 5): never drop or rename a column in the release that stops using it.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infra/database/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://flinger:flinger@localhost:5432/flinger',
  },
  strict: true,
  verbose: true,
});
