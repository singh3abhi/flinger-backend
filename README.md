# Flinger Backend

API, realtime and background workers for **Flinger** — a dating app ("Flings, Love & Stories").

> **Status:** planning. No code is scaffolded yet. Everything under [`docs/`](docs/README.md) is the plan we build against.

## Stack (decided)

| Concern | Choice |
|---|---|
| Framework | NestJS (TypeScript), modular monolith |
| Primary DB | PostgreSQL + PostGIS |
| Cache / queues / presence | Redis |
| Containers | Docker (local dev + deploy) |
| Mobile client | React Native (Expo) — repo: `flinger-mobile` |

Proposed-but-not-final choices (ORM, auth model, cloud, etc.) are tracked as ADRs in [`docs/adr/`](docs/adr/README.md).

## Repo family

| Repo | Purpose |
|---|---|
| `flinger-backend` (this repo) | NestJS API, realtime gateway, workers, infra definitions |
| `flinger-mobile` | Expo / React Native app (iOS + Android) |
| `flinger-web` *(later)* | Next.js web client |
| `flinger-flutter`, `flinger-node` | **Legacy.** Reference only; see [legacy migration](docs/10-legacy-migration.md) |

The repos are independent. The **OpenAPI spec published by this repo is the contract** the clients generate their code from ([API & contracts](docs/04-api-and-contracts.md)).

## Where to start

1. [Product & scope](docs/00-product-and-scope.md) — what we are building and what v1 is *not*
2. [System design](docs/01-system-design.md) — components, flows, scaling stages
3. [Architecture](docs/02-architecture.md) — code structure and rules
4. [Roadmap](docs/09-roadmap.md) — phases and exit criteria

## Local development

Prerequisites: Node 22+ (24 recommended), pnpm 11 (`corepack enable`), Docker.

```bash
pnpm install
cp .env.example .env
docker compose up -d      # Postgres + PostGIS, Redis, Mailpit (emails at http://localhost:8025)
pnpm db:migrate
pnpm start:dev            # API on :4000, interactive docs at http://localhost:4000/docs
```

| Command | What it does |
|---|---|
| `pnpm lint` / `pnpm format:check` / `pnpm typecheck` | Static checks |
| `pnpm test` | Unit tests |
| `pnpm test:e2e` | HTTP-layer tests with in-memory Postgres/Redis fakes, plus the OpenAPI contract check |
| `pnpm openapi:build` | Regenerate `openapi/openapi.json` after changing an endpoint or DTO, then commit it |
| `pnpm db:generate` / `pnpm db:migrate` | Create / apply SQL migrations |
| `pnpm build` then `pnpm start:api` | Production build and run (also `start:realtime`, `start:worker`) |

## Status

Phase 1 scaffold is done: three process modes, validated config, structured logging, problem+json errors, health/readiness, `GET /v1/config`, OpenAPI contract, migrations, Docker image. GitHub Actions is off for now (templates in `docs/ci/`). Work now proceeds **feature by feature, end to end** with the mobile app (first feature: email sign-in).
