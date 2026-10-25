# ADR-0008 — Realtime with Socket.IO + Redis adapter

**Status:** Proposed · 2026-10-25

## Decision
Chat uses **Socket.IO** (`@nestjs/websockets`) with the **Redis adapter**; WebSocket-only transport (no long-polling → no sticky sessions). Postgres is the source of truth; the socket is a latency optimization with REST gap-fill on reconnect. See [06](../06-discovery-matching-chat.md).

## Consequences
- ✅ First-class Nest support, reconnection/rooms built in, horizontal scaling via the adapter.
- ⚠️ Must handle auth expiry on long-lived connections (client refreshes and reconnects).
- ⚠️ Fan-out cost grows with connected users — measured in the P8 load test.

## Alternatives
Managed realtime (Ably/Pusher/Firebase) — faster to ship, per-message cost and vendor lock-in; raw `ws` — more code for rooms/reconnect; consider managed realtime only if chat becomes a schedule risk.
