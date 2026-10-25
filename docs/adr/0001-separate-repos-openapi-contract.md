# ADR-0001 — Separate repos; OpenAPI is the contract

**Status:** Accepted · 2026-10-25

## Context
Backend and mobile (and later web) release on different cadences and may have different contributors. A monorepo was considered for shared schemas/types.

## Decision
Use **separate repositories** (`flinger-backend`, `flinger-mobile`, later `flinger-web`). The backend generates an **OpenAPI document from its Zod schemas**; clients generate typed API code from the released spec. No shared runtime package.

## Consequences
- ✅ Independent CI/CD, access control and release cycles.
- ✅ The generated client works for any future consumer (web, partners).
- ⚠️ Contract drift is possible → mitigated by `oasdiff` in backend CI, a drift check in client CI, and additive-only changes within `/v1` ([API doc](../04-api-and-contracts.md)).
- ⚠️ Design tokens are duplicated across client repos (small; extract later if it drifts).

## Alternatives
- Monorepo (pnpm + Turborepo) — better type sharing and atomic changes, rejected by owner for repo independence.
- Private npm package `@flinger/shared` — needs a registry and release overhead per schema change.
- Git submodules — frequent sync pain.
