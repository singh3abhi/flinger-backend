# ADR-0005 — Drizzle ORM

**Status:** Proposed · 2026-10-25

## Decision
Use **Drizzle ORM** (+ `drizzle-kit` for SQL migrations, `pg` driver) wrapped in a `DatabaseModule` provider and per-module repositories.

## Why
SQL-first and type-safe; easy to drop to raw SQL for PostGIS (`ST_DWithin`, KNN ordering) and advisory locks; migrations are plain SQL files that are reviewable in PRs.

## Consequences
- ✅ Predictable queries, good fit for geo and partitioned tables.
- ⚠️ Less batteries than TypeORM/Prisma (no active-record conveniences); PostGIS column types need a small custom type.
- ⚠️ Smaller ecosystem than Prisma; acceptable.

## Alternatives
Prisma (weak PostGIS/partitioning support), TypeORM/MikroORM (heavier, decorator-based; fine but less SQL control), Kysely (very close alternative; choose if Drizzle's migration tooling disappoints).
