# Architecture Decision Records (backend)

One page per significant decision. To change a decision, add a new ADR that **supersedes** the old one.

Status values: **Accepted** (owner decided) · **Proposed** (recommended, awaiting owner confirmation) · **Superseded by NNNN**.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-separate-repos-openapi-contract.md) | Separate repos; OpenAPI is the contract | Accepted |
| [0002](0002-postgres-postgis.md) | PostgreSQL + PostGIS as primary database | Accepted |
| [0003](0003-redis-role.md) | Redis for ephemeral state, queues and fan-out | Accepted |
| [0004](0004-nestjs-modular-monolith.md) | NestJS as a modular monolith | Accepted |
| [0005](0005-drizzle-orm.md) | Drizzle ORM | Proposed |
| [0006](0006-auth-jwt-phone-otp.md) | JWT + rotating refresh tokens; phone-OTP primary | Proposed |
| [0007](0007-docker-aws-ecs.md) | Docker, deployed on AWS ECS Fargate | Docker Accepted · AWS Proposed |
| [0008](0008-realtime-socketio-redis.md) | Realtime with Socket.IO + Redis adapter | Proposed |
| [0009](0009-push-via-fcm.md) | Push notifications via FCM | Proposed |
| [0010](0010-pin-nest-11-and-ts-5.md) | Pin NestJS 11 and TypeScript 5.9 for now | Accepted |

Template: copy any existing ADR; keep it to one page (Context · Decision · Consequences · Alternatives).
