# ADR-0010 — Pin NestJS 11 and TypeScript 5.9 (for now)

**Status:** Accepted · 2026-10-25

## Context
At scaffold time the latest releases were NestJS 12 and TypeScript 7. `nestjs-zod` (our single source for validation and OpenAPI, ADR-0004) declares peer support for Nest 10/11 only, and the TypeScript 7 toolchain is not yet supported by ts-jest, typescript-eslint or the Nest CLI.

## Decision
Use **NestJS 11.x**, **TypeScript ~5.9**, ESLint 9. Revisit when `nestjs-zod` lists Nest 12 and the TS 7 tooling catches up.

## Consequences
- Everything installs without peer-dependency overrides; the full test suite passes.
- A later upgrade to Nest 12 is a planned, dedicated PR.
- `tsx`/esbuild cannot emit decorator metadata, so NestJS code is never run through `tsx`. Scripts that boot Nest run under Jest (for example the OpenAPI contract test) or against the compiled `dist/`.
- esbuild is pinned to one version via `pnpm-workspace.yaml`; mixed versions broke `tsx`.
- Local/CI Postgres uses `imresamu/postgis` because the official `postgis/postgis` image has no arm64 build. Production uses managed Postgres, not this image.
