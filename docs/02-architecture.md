# 02 — Backend Architecture (NestJS)

Status: Draft v0.1 · Related ADRs: [0004](adr/0004-nestjs-modular-monolith.md), [0005](adr/0005-drizzle-orm.md), [0008](adr/0008-realtime-socketio-redis.md)

## 1. Style

**Modular monolith.** One repo, one image. The domain is split into NestJS modules with explicit public APIs. Process modes (`api`, `realtime`, `worker`) pick which modules/transport are active.

## 2. Repository layout (target)

```
flinger-backend/
├── src/
│   ├── main.api.ts            # HTTP bootstrap
│   ├── main.realtime.ts       # WebSocket gateway bootstrap
│   ├── main.worker.ts         # Queue processors (createApplicationContext, no HTTP)
│   ├── app.module.ts          # composes modules per process mode
│   │
│   ├── config/                # typed env (zod-validated), feature flags
│   ├── common/                # cross-cutting, domain-agnostic
│   │   ├── guards/            # JwtAuthGuard, RolesGuard, ThrottlerGuard wrappers
│   │   ├── filters/           # ProblemDetailsFilter (RFC 7807)
│   │   ├── interceptors/      # logging, request-id, timeout
│   │   ├── decorators/        # @CurrentUser, @Public, @Idempotent
│   │   ├── pipes/             # ZodValidationPipe
│   │   ├── errors/            # DomainError hierarchy + error codes
│   │   └── pagination/        # cursor helpers
│   │
│   ├── infra/                 # adapters to the outside world (no business rules)
│   │   ├── database/          # Drizzle provider, migrations runner, tx helper
│   │   ├── redis/             # ioredis provider, key builders
│   │   ├── queue/             # BullMQ registration, queue names
│   │   ├── storage/           # S3 presign, CDN URL builder
│   │   ├── push/              # FCM sender
│   │   ├── sms/               # SmsProvider interface + implementations
│   │   ├── mail/              # MailProvider (SES / SMTP-mailpit in dev)
│   │   └── moderation/        # ImageModerationProvider (Rekognition)
│   │
│   └── modules/
│       ├── auth/              # otp, tokens, sessions/devices
│       ├── users/             # account lifecycle (status, deletion)
│       ├── profiles/          # profile, preferences, location
│       ├── media/             # photo upload, processing, moderation state
│       ├── discovery/         # candidate generation + deck delivery
│       ├── swipes/            # like/pass + match creation
│       ├── matches/           # match list, unmatch
│       ├── chat/              # conversations, messages, gateway
│       ├── notifications/     # push orchestration, device tokens
│       ├── safety/            # block, report, moderation actions
│       └── health/            # terminus health/readiness
├── drizzle/                   # generated SQL migrations (committed)
├── test/                      # e2e + integration (Testcontainers)
├── docker/                    # Dockerfile(s), compose, init SQL (extensions)
├── infra/                     # Terraform (added in phase 1/8)
└── docs/
```

## 3. Inside a module

```
modules/profiles/
├── profiles.module.ts
├── profiles.controller.ts        # HTTP transport only: parse → call service → map
├── profiles.service.ts           # application logic / use-cases, transactions
├── profiles.repository.ts        # the ONLY place that touches this module's tables (Drizzle)
├── dto/                          # zod schemas → DTOs (nestjs-zod); source of OpenAPI
├── domain/                       # pure types, value objects, rules (no Nest, no I/O)
├── events/                       # domain events emitted by this module
├── jobs/                         # queue processors owned by this module
└── index.ts                      # PUBLIC API: what other modules may import
```

### Layer rules

```
controller / gateway / job processor     (transport)
        │  calls
        ▼
service                                    (use-cases; owns transactions)
        │  calls
        ▼
repository  +  infra adapters              (persistence / external I/O)
        │
        ▼
domain (pure functions & types)            (no framework, no I/O)
```

1. **Controllers are thin**: validate → authorize → call one service method → map to response DTO. No Drizzle, no business rules.
2. **Services own use-cases and transactions.** They accept/return domain types or DTOs, never raw DB rows from another module.
3. **Repositories are module-private.** A module may only touch its own tables. For another module's data, call that module's **service via its public `index.ts`**.
4. **`domain/` is framework-free** and unit-testable without Nest.
5. **No cyclic module imports.** If two modules need each other, extract an event or a third module. Enforced by lint (`eslint-plugin-boundaries` or `dependency-cruiser`) in CI.
6. **Infra adapters are behind interfaces** (`SmsProvider`, `ImageModerationProvider`, `PushSender`), injected via tokens so tests use fakes and vendors can be swapped.

## 4. Cross-module communication

| Need | Mechanism |
|---|---|
| Synchronous query ("is A blocked by B?") | Call the owning module's service (public API) |
| Side effect that others react to ("match created") | **Domain event** via `@nestjs/event-emitter` in-process → handlers enqueue BullMQ jobs for anything slow or cross-process |
| Realtime fan-out | Redis pub/sub through the Socket.IO Redis adapter |
| Must-not-lose events (future) | Transactional **outbox** table published by a worker (introduce when a lost event would hurt) |

Handlers must be **idempotent** (events can be re-delivered).

## 5. Conventions

### 5.1 Validation & DTOs
- Zod is the single schema language. `nestjs-zod` turns schemas into DTOs and feeds `@nestjs/swagger`, so **the OpenAPI spec is generated from the same schemas that validate requests**.
- Response DTOs are explicit — never return ORM rows directly (prevents leaking `passwordHash`-style fields, which the legacy service guarded with `select: false`).

### 5.2 Errors
- Services throw `DomainError` subclasses carrying a stable machine `code` (e.g. `OTP_INVALID`, `PROFILE_INCOMPLETE`).
- One global filter maps everything to RFC 7807 `application/problem+json` ([API doc](04-api-and-contracts.md)). Unknown errors → 500 with a generic message in non-dev environments (the legacy handler had a typo that disabled this — don't repeat).

### 5.3 Transactions
- A `TransactionManager` wraps Drizzle `db.transaction`. Services call `tx.run(async (t) => …)` and pass `t` into repository methods. No ambient/implicit transactions.

### 5.4 Config
- `config/` parses `process.env` with Zod at boot; the process **exits non-zero** on invalid config (legacy exited with code 0 — a bug). Typed `ConfigService` only; no `process.env` outside `config/`.

### 5.5 Logging
- `nestjs-pino`, JSON in all envs (pretty-print only locally). Every request gets `requestId`; user id attached after auth. **Never log OTPs, tokens, phone numbers or message bodies** (the legacy code `console.log`ged the OTP).

### 5.6 Time & IDs
- All timestamps `timestamptz`, UTC. IDs are **UUIDv7**. No auto-increment IDs exposed.

### 5.7 Idempotency
- Mutating endpoints that clients may retry (swipe, send message, create report) accept a client-generated `requestId`/`clientMsgId`; unique constraints make retries safe.

### 5.8 Pagination
- Cursor-based only (`?cursor=&limit=`), cursor = opaque base64 of the sort key. Max `limit` enforced.

### 5.9 Naming
- Files: `kebab-case.type.ts`. Classes: `PascalCase`. DB: `snake_case`, plural tables. Events: `<module>.<noun>.<past-tense>` (e.g. `matches.match.created`).

## 6. Process modes

| Mode | Entry | Loads | Scales on |
|---|---|---|---|
| `api` | `main.api.ts` | all HTTP controllers | CPU / RPS |
| `realtime` | `main.realtime.ts` | chat gateway + auth | concurrent sockets |
| `worker` | `main.worker.ts` | queue processors, schedulers | queue depth |

The same Docker image runs any mode via `CMD`/env (`APP_MODE=api|realtime|worker`).

## 7. Testing strategy

| Level | What | Tooling |
|---|---|---|
| Unit | `domain/` and pure service logic with fake repos/adapters | Jest |
| Integration | Repository + service against real Postgres(+PostGIS)/Redis | Jest + Testcontainers |
| E2E / contract | HTTP through the real Nest app, auth included; asserts response matches OpenAPI | Jest + supertest |
| Load (pre-launch) | Discovery query, swipe write path, socket fan-out | k6 |

Rules: every bug fix lands with a regression test; no mocking the database in integration tests; migrations are tested by applying them to a clean DB in CI.

## 8. Definition of done (per PR)

- Types, lint, tests pass; new behavior covered at the lowest sensible level
- OpenAPI diff reviewed (no breaking change without a version bump)
- Migration is backward-compatible (expand/contract) if schema changed
- No secrets, PII in logs, or `console.log`
- Docs/ADR updated when a decision changed
