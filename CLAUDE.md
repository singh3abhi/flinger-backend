# CLAUDE.md — flinger-backend

Guidance for Claude Code (and humans) working in this repo.

## State
Planning only — **no code scaffolded yet**. The source of truth is `docs/`. Start with `docs/README.md`, then `docs/02-architecture.md` before writing code. Roadmap and exit criteria: `docs/09-roadmap.md`.

## Fixed decisions (do not relitigate)
NestJS (modular monolith) · PostgreSQL + PostGIS · Redis · Docker · separate repos (`flinger-mobile` is the client) · OpenAPI is the contract. Proposed items (Drizzle, JWT/phone-OTP, AWS ECS, Socket.IO, FCM) are in `docs/adr/` — treat as the default unless the owner changes them.

## Rules
- Follow module layering: controller → service → repository; repositories are module-private; cross-module calls go through a module's public `index.ts`.
- Zod is the single schema source (`nestjs-zod`); never return ORM rows directly.
- Errors are `DomainError`s with stable `code`s, mapped to RFC 7807 by the global filter.
- Mutating endpoints that clients may retry must be idempotent.
- Never log secrets, OTPs, tokens, phone numbers or message bodies. No `console.log`.
- Migrations: expand → migrate → contract; never drop/rename in the same release that stops using a column.
- API changes inside `/v1` are additive only; run the OpenAPI diff before opening a PR.
- Config only via the typed config module; invalid config must exit non-zero.
- When a decision changes, add/supersede an ADR instead of editing history.

## Commands (available after roadmap phase 1)
```bash
pnpm install
docker compose up -d          # postgres+postgis, redis, mailpit
pnpm db:migrate               # apply drizzle migrations
pnpm start:dev                # API with watch
pnpm test                     # unit
pnpm test:int                 # integration (Testcontainers)
pnpm lint && pnpm typecheck
pnpm openapi:build            # writes openapi.json
```

## Legacy
`../flinger-node` (Express/Mongo) is reference only. See `docs/10-legacy-migration.md` for what to port and the defects not to repeat.

## Git
Repos under `~/Development/Personal` use the personal SSH key and `abhinavsinghdeveloper@gmail.com` automatically (git `includeIf`). Conventional commit messages; small PRs against `main`.
