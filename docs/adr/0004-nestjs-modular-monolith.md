# ADR-0004 — NestJS as a modular monolith

**Status:** Accepted (NestJS: owner) / modular-monolith shape: recommended and adopted · 2026-10-25

## Context
Need to ship fast, but keep boundaries clean enough to scale and (if ever needed) extract services. Realtime chat and background jobs are first-class requirements.

## Decision
One NestJS codebase, **modules per domain** with public `index.ts` APIs, module-private repositories, and three process modes (`api`, `realtime`, `worker`) from one Docker image. Zod (`nestjs-zod`) is the validation/OpenAPI source. See [architecture](../02-architecture.md).

## Consequences
- ✅ Opinionated structure, DI → testable; WebSockets, BullMQ, Swagger, throttling, health are first-party modules.
- ✅ Extract a module to a service later along existing seams.
- ⚠️ Nest defaults to CommonJS; ESM has friction → build `apps` as CJS.
- ⚠️ Decorator-heavy style and boilerplate; mitigated with conventions and generators.
- ⚠️ Discipline needed so modules don't reach into each other's tables → enforced via lint (module-boundary rule).

## Alternatives
Keep Express (less structure, hand-rolled everything), Fastify (fast but less batteries), microservices from day one (operational overhead not justified).
