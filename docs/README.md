# Flinger Backend — Documentation Index

Last updated: 2026-10-25 · Status: **Draft v0.1**

| # | Doc | Answers |
|---|---|---|
| 00 | [Product & scope](00-product-and-scope.md) | What is v1? What is explicitly out? What do we assume? |
| 01 | [System design](01-system-design.md) | Components, request flows, scaling stages, failure modes |
| 02 | [Architecture](02-architecture.md) | NestJS module layout, layering rules, conventions |
| 03 | [Data model](03-data-model.md) | Postgres/PostGIS schema, indexes, partitioning, Redis keys |
| 04 | [API & contracts](04-api-and-contracts.md) | REST conventions, errors, versioning, OpenAPI → client codegen |
| 05 | [Auth & security](05-auth-and-security.md) | Login, tokens, rate limits, abuse, privacy/compliance |
| 06 | [Discovery, matching & chat](06-discovery-matching-chat.md) | The three hard product subsystems |
| 07 | [CI/CD](07-cicd.md) | Pipelines, environments, release and rollback |
| 08 | [Infrastructure & operations](08-infra-and-operations.md) | AWS layout, IaC, observability, backups, cost |
| 09 | [Roadmap](09-roadmap.md) | Phases, exit criteria, MVP cut |
| 10 | [Legacy migration](10-legacy-migration.md) | What to port / not port from `flinger-node` |
| 11 | [Requirements](11-requirements.md) | Functional & non-functional requirements with IDs, priorities, phases |
| 12 | [Hinge baseline](12-hinge-baseline.md) | What the Flutter app already has, Hinge feature map, decisions needed |
| 13 | [API & schema reference](13-api-and-schema-reference.md) | Every endpoint, table and data store planned for v1, by feature |
| 14 | [Recommendations & Bloom filter](14-recommendations-and-bloom-filter.md) | How the Discover deck is built, ranked and kept free of repeats |
| — | [ADRs](adr/README.md) | One page per significant decision |

## How to use these docs

- **Decisions** live in ADRs. If you change your mind, add a new ADR that supersedes the old one — do not silently edit history.
- **Status labels** used everywhere: `Accepted` (decided by the owner), `Proposed` (recommended, awaiting confirmation), `Assumed` (a working assumption we will verify).
- Docs describe the **target** design. Where code and docs disagree, either is a bug — fix one and say so in the PR.
- Cross-cutting docs (product scope, system design, roadmap) are **canonical here**. `flinger-mobile` links back instead of copying.
