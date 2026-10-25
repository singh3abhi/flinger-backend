# CLAUDE.md — flinger-backend

Guidance for Claude Code (and humans) working in this repo.

## State
Phase 1 scaffold is built and verified. We work **feature by feature, end to end** (backend + `flinger-mobile`), infra later. Docs in `docs/` remain the design source of truth. Start with `docs/README.md`, then `docs/02-architecture.md` before writing code. Roadmap and exit criteria: `docs/09-roadmap.md`.

## Fixed decisions (do not relitigate)
NestJS (modular monolith) · PostgreSQL + PostGIS · Redis · Docker · separate repos (`flinger-mobile` is the client) · OpenAPI is the contract. Proposed items (Drizzle, JWT/phone-OTP, AWS ECS, Socket.IO, FCM) are in `docs/adr/` — treat as the default unless the owner changes them.

## Rules
- Follow module layering: controller → service → repository; repositories are module-private; cross-module calls go through a module's public `index.ts`.
- Zod is the single schema source (`nestjs-zod`); never return ORM rows directly. Nullable strings need a constraint (`z.string().max(n).nullable()`): a bare `z.string().nullable()` is published as `string[]` (guarded by the OpenAPI contract test).
- Errors are `DomainError`s with stable `code`s, mapped to RFC 7807 by the global filter.
- Mutating endpoints that clients may retry must be idempotent.
- Never log secrets, OTPs, tokens, phone numbers or message bodies. No `console.log`.
- Migrations: expand → migrate → contract; never drop/rename in the same release that stops using a column.
- API changes inside `/v1` are additive only; run the OpenAPI diff before opening a PR.
- Config only via the typed config module; invalid config must exit non-zero.
- When a decision changes, add/supersede an ADR instead of editing history.

## Commands
```bash
pnpm install
docker compose up -d          # postgres+postgis, redis, mailpit, seaweedfs (S3)
pnpm db:migrate               # apply drizzle migrations
pnpm start:dev                # API with watch
pnpm test                     # unit
pnpm test:e2e                 # HTTP layer + OpenAPI contract check
pnpm test:int                 # real Postgres + Redis (docker compose up -d first)
pnpm lint && pnpm typecheck
pnpm openapi:build            # writes openapi.json
```

## Open questions
Anything that needs the owner's decision goes in `docs/15-discussion-log.md` (with the default you are using meanwhile). Keep building; do not block on it.

## CI
GitHub Actions is **off** (templates in `docs/ci/`). Do not add files under `.github/workflows/` or `.github/dependabot.yml` until the owner asks. Run lint, types and tests locally before committing.

## Legacy
`../flinger-node` (Express/Mongo) is reference only. See `docs/10-legacy-migration.md` for what to port and the defects not to repeat.

## Git
Repos under `~/Development/Personal` use the personal SSH key and `abhinavsinghdeveloper@gmail.com` automatically (git `includeIf`). Conventional commit messages. **Work on `uat-release`** (the integration branch; merges deploy to UAT). Small, focused commits; open PRs against `uat-release`.
