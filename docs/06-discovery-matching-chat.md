# 06 — Discovery, Matching & Chat

Status: Draft v0.1. These three subsystems are where a dating backend gets hard; the design favors correctness first, with obvious places to optimize later.

## 1. Discovery (the swipe deck)

### 1.1 Goals
- Show each user a stream of relevant, unseen, safe candidates, fast.
- Never show: self, blocked/blocking users, already swiped, already matched, paused/suspended, unmoderated photos, under-18.
- Respect **mutual** preferences (A's filters match B *and* B's filters match A).

### 1.2 Candidate query (SQL, per user)

Eligible if all hold (pseudo-SQL):

```sql
SELECT p.user_id, ST_Distance(p.location, :me) AS meters
FROM profiles p
JOIN preferences pr ON pr.user_id = p.user_id
WHERE p.visibility = 'visible'
  AND p.onboarding_completed_at IS NOT NULL
  AND ST_DWithin(p.location, :me, :myMaxMeters)
  AND ST_Distance(p.location, :me) <= pr.max_distance_km * 1000      -- their radius too
  AND age(p.birth_date) BETWEEN :myMinAge AND :myMaxAge
  AND :myAge BETWEEN pr.min_age AND pr.max_age                        -- mutual age
  AND p.gender = ANY(:myInterestedIn)
  AND :myGender = ANY(pr.interested_in)                               -- mutual gender
  AND p.dating_mode = :myMode                                          -- v1: always 'dating'
  AND p.user_id <> :me
  AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=:me AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=:me))
  AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.swiper_id=:me AND s.target_id=p.user_id)
  AND EXISTS (SELECT 1 FROM profile_photos ph WHERE ph.user_id=p.user_id AND ph.moderation_status='approved')
ORDER BY score DESC, meters ASC
LIMIT :n;
```

`score` (v1, rules-based, deterministic and explainable): recent activity (decay), profile completeness (photos, bio), mild proximity boost, **minus** a recently-shown penalty. Weighted in config so it can be tuned without a deploy.

### 1.3 Deck delivery

```mermaid
flowchart TD
  A[GET /discovery/deck] --> B{disc:deck:{me}<br/>has >= limit?}
  B -- yes --> C[pop N ids from Redis list]
  B -- no --> D[run candidate query synchronously, small N]
  D --> C
  C --> E[hydrate profiles + photo URLs + bucketed distance]
  E --> F[return deck]
  C --> G{remaining < threshold?}
  G -- yes --> H[enqueue refill-deck job]
  H --> W[worker runs candidate query N=100<br/>filters by disc:seen<br/>pushes to disc:deck]
```

- The deck holds **ids only**; hydration reads fresh profile data so edits/deletions/blocks take effect.
- At hydration, ids are re-validated (still active, not blocked since queueing) — stale entries are dropped silently.
- **Seen set** (`disc:seen:{me}`): ids from `swipes`, `blocks`, `matches`. Rebuilt from Postgres on miss. Used to filter refills cheaply.
- Fallback if Redis is unavailable: run the SQL directly (slower, still correct).

### 1.4 Scaling notes
- Stage S0–S1: the query above with GiST + partial indexes is sufficient. Read replica serves refills at S1.
- If PostGIS radius queries get hot at large user counts: bucket users into geohash/H3 cells and pre-filter by cell, or maintain per-cell candidate lists in Redis. Not needed for v1; interface (`DiscoveryCandidateSource`) allows swapping.
- Cold-start (few users in radius): widen radius stepwise (configurable) and surface "expand your distance" in the client.

## 2. Swipes & matching

### 2.1 Write path

```
POST /swipes {targetId, direction, requestId}
  BEGIN
    INSERT INTO swipes ... ON CONFLICT (swiper_id, target_id) DO NOTHING   -- idempotent
    if direction = 'like':
       SELECT 1 FROM swipes WHERE swiper_id = target AND target_id = me AND direction='like'
       if found:
          INSERT matches (ordered pair) ON CONFLICT DO NOTHING RETURNING id
          INSERT conversations (match_id)
          emit domain event matches.match.created
  COMMIT
  update Redis seen-set, daily quota counter
```

- **Race safety:** if A and B like each other at the same instant under `READ COMMITTED`, each transaction can miss the other's *uncommitted* like and **no match is created**. Fix: at the start of the transaction take `pg_advisory_xact_lock(hash(least(A,B), greatest(A,B)))`. Concurrent swipes between the same pair then serialize, the second one sees the first's committed like, and `UNIQUE(user_a,user_b)` + `ON CONFLICT DO NOTHING` guarantees a single match. Swipes between different pairs never contend. **Must be covered by a concurrency integration test in phase 5.**
- **Quota:** daily like limit enforced via Redis counter before the write; a `429`/domain error `LIKE_LIMIT_REACHED` returns the reset time.
- **Idempotency:** retry with the same `(swiper, target)` returns the original result.

### 2.2 After a match
`matches.match.created` → handlers: (a) enqueue push notifications for both users, (b) publish a realtime `match:new` event, (c) invalidate decks that might still contain the pair (they are in each other's seen-set already).

### 2.3 Unmatch / block
- **Unmatch:** set `unmatched_at`, close conversation (read-only/hidden), keep data for safety review; pair is permanently excluded from decks.
- **Block:** insert block row, same closure as unmatch, add to both seen-sets, remove from any deck lists lazily at hydration.

## 3. Chat

### 3.1 Transport
- **Socket.IO** with the Redis adapter ([ADR-0008](adr/0008-realtime-socketio-redis.md)); WebSocket transport only (no long-polling) so no sticky sessions are needed behind the ALB.
- Auth: access JWT passed in the connection handshake; reject on expiry; client reconnects after refreshing the token.
- Each connected user joins room `user:{userId}`; fan-out to that room works across nodes via the adapter.

### 3.2 Message lifecycle

1. Client generates `clientMsgId` (UUID), optimistically renders the message as *sending*.
2. `message:send {conversationId, clientMsgId, body}` → gateway validates (participant, not blocked, body length, rate limit) → **INSERT** (unique on `(conversation_id, client_msg_id)`) → ack `{messageId, createdAt}`.
3. Gateway emits `message:new` to the recipient's room. Offline/backgrounded recipient → worker sends a push.
4. Recipient app sends `read {conversationId, upToMessageId}`; server updates read state and emits to sender.
5. `typing` events are **ephemeral** (never persisted, throttled).

Ordering: server-assigned UUIDv7 `id` defines order. Clients sort by `id`, not by local clock.

### 3.3 Reliability
- At-least-once delivery from server to client; clients **de-duplicate by `messageId`**.
- On (re)connect, the client calls `GET /conversations/:id/messages?after=<lastKnownId>` to fill gaps — the socket is a latency optimization, **REST/Postgres is the source of truth**.
- Failed sends: the client retries with the same `clientMsgId` (safe) and shows a retry affordance.

### 3.4 Limits & safety
- Max body length (e.g. 2,000 chars); text only in v1; per-user message rate limit; no messaging after unmatch/block; report-from-message creates a report with a message snapshot for moderators.

### 3.5 Scaling notes
- Presence uses `presence:{userId}` with a 60 s TTL refreshed by heartbeat; not persisted.
- Partition `messages` monthly; archive old partitions to cheaper storage when needed.
- If chat outgrows Postgres (very high message volume), the `MessageRepository` interface allows moving history to a different store without touching the gateway — only when metrics justify it.

## 4. Notifications

- Device tokens live in `devices`; sending goes through a `PushSender` interface (FCM; APNs via FCM) from the worker.
- Types in v1: `new_match`, `new_message`. Message pushes are **collapsed per conversation** and suppressed when the recipient has an active socket.
- Payloads carry ids only, no message text by default (privacy on lock screens); the app fetches content on open.
- Quiet hours and per-type opt-outs are stored in `preferences` (added when needed).
- Invalid tokens (`UNREGISTERED`) are deleted on send failure.
