# ADR-0003 — Redis for ephemeral state, queues and fan-out

**Status:** Accepted · 2026-10-25

## Decision
Redis is used for: OTP + cooldown + attempts, rate limits, discovery decks and seen-sets (cache), presence, BullMQ queues, Socket.IO adapter pub/sub. **Redis is never the only copy of anything we cannot rebuild.** Postgres is the source of truth.

## Consequences
- ✅ Fast, simple building blocks; one dependency for several needs.
- ⚠️ Flushing Redis must be safe: users re-authenticate if needed, decks/seen-sets rebuild from Postgres, queued jobs may be lost (jobs must be re-derivable or tolerant).
- ⚠️ Key hygiene: every key has an env prefix and a TTL (except rebuildable sets) — see [data model §6](../03-data-model.md).
- At scale, split BullMQ and cache into separate instances to avoid eviction interference.

## Alternatives
RabbitMQ/SQS for queues (extra moving part), Memcached (no pub/sub, no data structures).
