# ADR-0002 — PostgreSQL + PostGIS as primary database

**Status:** Accepted · 2026-10-25

## Context
The legacy service used MongoDB. The domain is strongly relational (users ↔ matches ↔ conversations ↔ messages, blocks, reports) and needs geo queries and transactional integrity (matching).

## Decision
**PostgreSQL 16+ with PostGIS** is the system of record. Managed service (RDS on AWS).

## Consequences
- ✅ ACID transactions for swipe→match; constraints (unique pairs, age check) enforce invariants in the DB.
- ✅ PostGIS `ST_DWithin` + GiST for radius search; no separate geo store.
- ✅ Partitioning for `swipes`/`messages` when they grow.
- ⚠️ Schema migrations need discipline (expand/contract) — covered in [CI/CD](../07-cicd.md).
- ⚠️ Connection management: use a pooler (RDS Proxy/PgBouncer) as task count grows.
- No data migration needed (no production data in Mongo).

## Alternatives
MongoDB (legacy; weaker relational integrity, geo queries OK but joins awkward), DynamoDB (cost-effective at scale but poor ad-hoc queries/geo).
