# 11 — Requirements (Functional & Non-Functional)

Status: Draft v0.2 · 2026-10-25 · Owner decisions Q1–Q6 incorporated (marked ✅). Remaining open items are listed at the end and in [Hinge baseline](12-hinge-baseline.md) §3.

## How to read this

- **ID**: `FR-<AREA>-<nn>` functional, `NFR-<AREA>-<nn>` non-functional. IDs are stable; never reuse one.
- **Priority** (MoSCoW against **v1 launch**): **M** Must · **S** Should (v1 if time allows, otherwise first fast-follow) · **C** Could (post-v1) · **W** Won't in v1 (design must not preclude it).
- **Phase**: the roadmap phase that delivers it ([roadmap](09-roadmap.md), P1–P8). Mobile milestones (M1–M8) deliver the client side of the same phase.
- Numbers (limits, targets) are **starting values** marked *(assumed)*; they live in config or this doc, not scattered in code.
- Each Must requirement must be testable; acceptance hints are given where the test isn't obvious.

## Actors

| Actor | Description |
|---|---|
| **Visitor** | Not signed in |
| **Member** | Signed-in user (states: `pending` onboarding → `active` → `paused`/`suspended`/`deleted`) |
| **Moderator/Operator** | Internal (the owner in v1) reviewing reports and photos |
| **System** | Background workers, schedulers |

---

# Part A — Functional requirements

## A1. Authentication & sessions (AUTH)

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-AUTH-01 | ✅ A visitor can sign up / sign in with **either a phone number or an email address, each via a 6-digit OTP**. The same flow creates the account on first success. **Release sequencing (owner, 2026-10-25): Phase 0 launch ships email OTP; phone OTP follows in Phase 1 once the SMS provider and India DLT registration are sorted.** | M | P2 |
| FR-AUTH-02 | OTP expires after 10 min *(assumed)*; resend allowed after a 120 s cooldown; at most 5 verification attempts per code, then the code is invalidated. | M | P2 |
| FR-AUTH-03 | OTP requests are rate-limited per identity and per IP (e.g. 5/h per identity, 20/h per IP *(assumed)*); the user sees a clear "try again in N s" message. | M | P2 |
| FR-AUTH-04 | Sign in with **Apple** (required on iOS if any other social login exists) and **Google**. | S | P2 |
| FR-AUTH-05 | ✅ **Email OTP** is a first-class sign-in method (not only a fallback) and also serves account recovery. | M | P2 |
| FR-AUTH-12 | ✅ **One account per phone number and one per email** (like Hinge). Identities are globally unique; a member may attach the other identity (email ↔ phone) after verifying it; attempts to reuse an identity that belongs to another account are rejected with a clear message. Multiple devices per account remain allowed. | M | P2 |
| FR-AUTH-06 | Session persists across app restarts (refresh-token rotation); the user is not asked to re-authenticate unless the session is revoked or expired (30 d *(assumed)*). | M | P2 |
| FR-AUTH-07 | A member can **log out** (this device) and **log out of all devices**. | M | P2 |
| FR-AUTH-08 | A member can be signed in on multiple devices; each device has its own revocable session. (Does **not** relax FR-AUTH-12.) | S | P2 |
| FR-AUTH-09 | If a refresh token is reused (theft signal) all sessions of that family are revoked and the user must sign in again. | M | P2 |
| FR-AUTH-10 | Suspended or deleted accounts cannot authenticate and see a clear message with a support path. | M | P7 |
| FR-AUTH-11 | The app blocks use of too-old versions with an **"Update required"** screen when the backend raises the minimum supported version. | M | P2 |

## A2. Onboarding & profile creation (ONB)

The onboarding data set is **taken from the existing Flutter questionnaire** (11 steps, `abhinav` branch) and aligned with the Hinge baseline ([12](12-hinge-baseline.md)). Option lists use stable `snake_case` ids (display text is localized client-side).

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-ONB-01 | Birthdate is collected and **members must be ≥ 18**, enforced server-side; the app shows an age-confirmation step and blocks under-18s. No profile is created for under-18. | M | P4 |
| FR-ONB-02 | **First name** (2–30 chars, letters only) and **birthdate**. | M | P4 |
| FR-ONB-03 | **Gender** (single): `woman`, `man`, `non_binary`. | M | P4 |
| FR-ONB-04 | **Who they want to meet** (multi): `woman`, `man`, `non_binary` (the prototype's `men/women/non_binary` labels are normalized to the same ids as gender), with an "everyone" shortcut. | M | P4 |
| FR-ONB-05 | **Dating intentions** ("hoping to find", pick up to **2**): long-term relationship, life partner, something casual, intimacy without commitment, marriage, ethical non-monogamy. | M | P4 |
| FR-ONB-06 | **Height** in cm (sane range, e.g. 120–230). | M | P4 |
| FR-ONB-07 | **Values in a person** (pick up to **3** of 15). | S | P4 |
| FR-ONB-08 | **Kids** (have / don't have) and **family plans** (don't want / want / open / not sure) — **skippable**, editable later. | S | P4 |
| FR-ONB-09 | **Religion** (16 options) and **politics** (6 options) — **skippable**, editable later. | S | P4 |
| FR-ONB-10 | **Causes & communities** (pick up to **3** of 15) — **skippable**. | S | P4 |
| FR-ONB-11 | ✅ **Photos: at least 4, at most 6** are required to finish onboarding; at least one must be `approved` before the profile is discoverable. (The prototype allows 2 — must be changed.) | M | P4 |
| FR-ONB-12 | ✅ **Prompts:** three prompt answers (≤150 chars each) chosen from a library (~30 to start). Accepted 2026-10-25 (D2). | M | P4 |
| FR-ONB-13 | Optional bio, max 500 chars *(assumed)*. | C | P4 |
| FR-ONB-14 | Discovery preferences: age range (18–99), max distance (1–200 km *(assumed)*); defaults pre-filled. | M | P4 |
| FR-ONB-15 | Location is requested **in context** (primer screen, then OS permission). If denied, the member can pick a city manually (coarse). | M | P4 |
| FR-ONB-16 | Onboarding shows progress (step N of M) and **resumes** after an app kill or re-login (draft saved locally and server-side once verified). | M | P4 |
| FR-ONB-17 | Terms, privacy policy and community guidelines are accepted before activation; acceptance is timestamped and versioned. | M | P4 |
| FR-ONB-18 | ✅ **Dating vs BFF mode:** hidden in v1; `dating_mode` field kept, default `dating`. Accepted 2026-10-25 (D3). | — | — |
| FR-ONB-19 | Account becomes `active` only after all Must steps complete (`onboarding_completed_at` set). | M | P4 |

## A3. Profile management (PROF)

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-PROF-01 | A member can view and edit their own profile (every onboarding answer except birthdate; photos order/add/remove). Gender/`interested_in` edits are allowed but rate-limited. | M | P4 |
| FR-PROF-02 | Birthdate is **not editable** after set (changes go through support) to prevent age-gate evasion. | M | P4 |
| FR-PROF-03 | A member can reorder photos; the first photo is the primary. The **minimum of 4 photos is enforced on delete/replace** (max 6). | M | P4 |
| FR-PROF-04 | A member can update preferences (age range, distance, genders) at any time; changes affect the next deck refill. | M | P5 |
| FR-PROF-05 | A member can hide their **distance** from others. | S | P4 |
| FR-PROF-06 | A member can **pause** their account: removed from all decks, existing chats preserved, reversible anytime. | M | P7 |
| FR-PROF-07 | A member can see another member's full profile (photos carousel, name, age, bio, distance bucket) from a deck card or match. | M | P5 |
| FR-PROF-08 | Other members **never** see exact location, birthdate (only age), phone number or email. | M | P4 |

## A4. Media (MEDIA)

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-MEDIA-01 | Photos upload **directly to object storage** via short-lived presigned URLs; the API never receives image bytes. | M | P4 |
| FR-MEDIA-02 | Accepted: JPEG/PNG/HEIC, max 10 MB *(assumed)*, min 400 px short edge *(assumed)*; the client downsizes/compresses first (max ~1600 px long edge). | M | P4 |
| FR-MEDIA-03 | The backend validates file type by content (magic bytes), strips EXIF/GPS, and generates display sizes. | M | P4 |
| FR-MEDIA-04 | Every photo is auto-moderated before it is visible to others: `pending → approved \| rejected`. Owners see status and a reason category on rejection and can replace the photo. | M | P4 |
| FR-MEDIA-05 | Only `approved` photos are returned in discovery, matches and chat headers. | M | P4 |
| FR-MEDIA-06 | Deleting a photo or the account removes the stored objects (within the deletion SLA, §NFR-PRIV). | M | P7 |
| FR-MEDIA-07 | Photo verification (selfie match). | C | post-v1 |

## A5. Discovery (DISC)

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-DISC-01 | A member can fetch a **deck** of candidate profiles in batches (default 20 *(assumed)*, max 50). | M | P5 |
| FR-DISC-02 | A candidate is eligible only if: active, visible, onboarding complete, same `dating_mode` (v1: only `dating`), ≥1 approved photo, within **both** members' distance limits, within **both** members' age ranges, and gender preferences match **both** ways. | M | P5 |
| FR-DISC-03 | The deck **never** includes: self, anyone already swiped, anyone blocked/blocking, anyone already matched, paused/suspended/deleted members. | M | P5 |
| FR-DISC-04 | Ordering uses a transparent rules-based score (recent activity, profile completeness, proximity, minus recently-shown penalty); weights are configurable without a deploy. | M | P5 |
| FR-DISC-05 | Distance is shown as a rounded bucket (min 1 km) — never coordinates. | M | P5 |
| FR-DISC-06 | When the deck is exhausted the member sees an empty state with actions: expand distance/age, try later. The system can widen the radius stepwise when density is low. | M | P5 |
| FR-DISC-07 | ✅ A **daily like limit of 25** applies; when reached, the member sees the reset time. Passes are unlimited. The limit is read from an **entitlement/limits config** (not hard-coded) so subscription plans can change it later without schema changes. Resets at a fixed local time *(assumed 04:00 IST)*. | M | P5 |
| FR-DISC-08 | Discovery keeps working (slower) if the cache layer is unavailable. | S | P5 |
| FR-DISC-09 | Undo last swipe; "super like"; boosts; "who liked you". | W | post-v1 |

## A6. Swipes & matching (MATCH)

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-MATCH-01 | A member can **like** or **pass** a candidate. Swipes are **idempotent** (retrying never double-counts or double-matches). | M | P5 |
| FR-MATCH-02 | When two members have liked each other, **exactly one match** and one conversation are created, even under simultaneous likes. | M | P5 |
| FR-MATCH-03 | Both members are notified of a new match immediately (in-app event if online, push if not). | M | P5/P6 |
| FR-MATCH-04 | A member sees a **matches list** (newest first) with unread indicators and can open the profile or chat. | M | P5 |
| FR-MATCH-05 | A member can **unmatch**: the chat closes for both, the pair never reappears in discovery. | M | P7 |
| FR-MATCH-06 | A swipe performed offline is queued and sent when connectivity returns (best effort, idempotent). | S | P5 |

## A7. Chat (CHAT)

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-CHAT-01 | Matched members can exchange **text messages** (max 2,000 chars *(assumed)*) in a 1:1 conversation; non-matched or blocked members cannot. | M | P6 |
| FR-CHAT-02 | Messages are delivered in realtime to online recipients; history is loaded with cursor pagination. | M | P6 |
| FR-CHAT-03 | Sends are **idempotent** (client message id); retry after failure never duplicates; messages show states *sending / sent / failed (retry)*. | M | P6 |
| FR-CHAT-04 | Message order is server-defined and consistent across devices. | M | P6 |
| FR-CHAT-05 | After a reconnect the client recovers any messages missed while offline (gap-fill). | M | P6 |
| FR-CHAT-06 | Conversation list shows last message preview, time and **unread count**, ordered by latest activity. | M | P6 |
| FR-CHAT-07 | **Read receipts** and **typing indicators** (ephemeral). Read receipts can be disabled by the member. | S | P6 |
| FR-CHAT-08 | Unsent messages survive app restarts (local outbox) and are delivered in order when online. | S | P6 |
| FR-CHAT-09 | A member can report a message or the other member from within a chat (snapshot of recent messages attached to the report). | M | P7 |
| FR-CHAT-10 | Images, GIFs, voice notes, video calls, message reactions, message deletion/edit. | W | post-v1 |

## A8. Notifications (NOTIF)

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-NOTIF-01 | Push notification for **new match** and **new message**; tapping deep-links into the right screen. | M | P6 |
| FR-NOTIF-02 | Push payloads contain **ids/type only** by default (no message text on the lock screen). | M | P6 |
| FR-NOTIF-03 | Message pushes are collapsed per conversation and suppressed when the recipient is actively connected to that conversation. | S | P6 |
| FR-NOTIF-04 | Notification permission is requested after value is shown (e.g. first match), with a primer; "Maybe later" is remembered. | M | P6 |
| FR-NOTIF-05 | Per-type opt-out and quiet hours. | C | post-v1 |
| FR-NOTIF-06 | Invalid/expired device tokens are removed automatically; logout deregisters the token. | M | P6 |
| FR-NOTIF-07 | Email/SMS marketing or re-engagement notifications. | W | post-v1 |

## A9. Safety, trust & moderation (SAFE)

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-SAFE-01 | A member can **block** another member from a profile or chat. Block is mutual in effect: neither sees the other in discovery; any match/conversation closes. | M | P7 |
| FR-SAFE-02 | A member can **report** a member/photo/message with a reason (spam, fake, harassment, inappropriate photo, underage, other) and optional details; reports are stored for review and acknowledged to the reporter. | M | P7 |
| FR-SAFE-03 | A **reported photo** is re-queued for moderation and hidden pending review when a threshold of reports is met *(assumed 3)*. | S | P7 |
| FR-SAFE-04 | Operators can list/triage reports, view context, and apply actions: dismiss, warn, remove photo, suspend, ban. Every action is written to an **audit log**. (v1: SQL scripts/internal CLI; no UI.) | M | P7 |
| FR-SAFE-05 | A suspended member is signed out, removed from discovery and cannot sign in until reinstated. | M | P7 |
| FR-SAFE-06 | Per-user rate limits on swipes, messages and reports to deter abuse/spam. | M | P5–P7 |
| FR-SAFE-07 | Basic safety content: in-app community guidelines and safety tips. | S | P7 |
| FR-SAFE-08 | Automated spam/link heuristics in chat; selfie/ID verification badge. | C | post-v1 |

## A10. Account, settings & privacy (ACCT)

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-ACCT-01 | A member can **delete their account** in-app (required by Apple/Google). The account is hidden and sessions revoked immediately; personal data is purged within the retention window (NFR-PRIV-03). | M | P7 |
| FR-ACCT-02 | A member can **request a data export** (profile, matches, messages they sent) delivered via a time-limited secure link. | S | P7 |
| FR-ACCT-03 | Settings screen: edit profile/preferences, pause, notification permission status, language, legal links, logout, delete. | M | P7 |
| FR-ACCT-04 | ✅ **English only** at launch; all strings are externalized so localization (Hindi first) can be added later. Existing Hindi ARB strings are parked, not shipped. | M | P3 |
| FR-ACCT-05 | Consent records (terms/privacy version + timestamp) are stored and re-requested when documents change materially. | S | P7 |
| FR-ACCT-06 | Account recovery for a lost phone number via verified email OTP + support. | C | post-v1 |

## A11. Platform & operations (OPS)

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-OPS-01 | `GET /v1/config` returns minimum supported app version, feature flags and tunable limits (photo count, like cap, bio length). | M | P2 |
| FR-OPS-02 | Health (`/health`) and readiness (`/ready`) endpoints for orchestration and uptime checks. | M | P1 |
| FR-OPS-03 | Seed/test accounts and fixed-OTP test numbers exist in **non-production only**, guarded by environment. | M | P2 |
| FR-OPS-04 | Product funnel events emitted by the app: sign-up started → OTP verified → onboarding completed → first swipe → first match → first message. No PII or message content in events. | S | P8 |
| FR-OPS-05 | Admin web console, bulk moderation UI, CRM tooling. | W | post-v1 |

## A12. Explicitly out of scope for v1 (Won't)

Payments/subscriptions/boosts · video profiles & video calls · media in chat · web client (`flinger-web`) · ML ranking/recommendations · ID/selfie verification · multi-region deployment · social-graph features (events, groups) · admin web console.

---

# Part B — Non-functional requirements

## B1. Performance (PERF) — *targets assumed, validated by load tests in P8*

| ID | Requirement | Pri |
|---|---|---|
| NFR-PERF-01 | API p95 latency: reads < 300 ms, writes < 500 ms (excluding media upload), measured at the load balancer under expected peak. | M |
| NFR-PERF-02 | Deck request p95 < 400 ms when served from the precomputed queue; < 1 s on cache miss (synchronous query). | M |
| NFR-PERF-03 | Chat message end-to-end delivery p95 < 1 s for online recipients. | M |
| NFR-PERF-04 | App cold start to interactive < 2.5 s on a mid-tier Android; splash is never held by a fixed timer. | M |
| NFR-PERF-05 | Swipe card drag/animation holds 60 fps on a mid-tier device; next 2–3 card photos are prefetched so cards never show blank. | M |
| NFR-PERF-06 | Photos load progressively (placeholder → image) and are served via CDN with long-lived caching; typical card image ≤ ~200 KB. | S |
| NFR-PERF-07 | Mobile JS bundle size tracked per PR; regression > 10 % requires justification. | S |

## B2. Scalability & capacity (SCALE)

| ID | Requirement | Pri |
|---|---|---|
| NFR-SCALE-01 | Launch capacity (S0): sustain ~50 swipes/s and ~2k concurrent sockets with p95 targets intact. Growth path to 10× via configuration (autoscaling, replicas) with no architectural rewrite. | M |
| NFR-SCALE-02 | API, realtime and worker scale **independently** (horizontally) from the same image. | M |
| NFR-SCALE-03 | All services are stateless; any state needed across requests lives in Postgres or Redis. | M |
| NFR-SCALE-04 | Hot, fast-growing tables (`swipes`, `messages`) are designed for partitioning; IDs are time-ordered UUIDs; pagination is cursor-based only. | M |
| NFR-SCALE-05 | Module boundaries allow extracting a module into its own service without data-model surgery (no cross-module table access). | S |
| NFR-SCALE-06 | Load tests (k6) exist for deck query, swipe write path and socket fan-out, with results recorded per release candidate. | M |

## B3. Availability & reliability (REL)

| ID | Requirement | Pri |
|---|---|---|
| NFR-REL-01 | API availability **99.5 %** monthly at launch (single region, Multi-AZ data). | M |
| NFR-REL-02 | No single point of failure for user-facing traffic inside the region: ≥ 2 API tasks, Multi-AZ database, managed Redis with failover. | M |
| NFR-REL-03 | Every retryable mutation is **idempotent** (swipe, message send, report, photo registration). | M |
| NFR-REL-04 | Graceful degradation: Redis outage → discovery falls back to direct queries; push outage → in-app delivery continues; SMS outage → fallback provider or email OTP. | S |
| NFR-REL-05 | Background jobs retry with exponential backoff and land in a dead-letter queue with alerts; jobs are safe to run twice. | M |
| NFR-REL-06 | Deployments are zero-downtime (rolling) with automatic rollback on failed health checks. | M |
| NFR-REL-07 | Clients tolerate flaky networks: timeouts, retries with backoff, offline banner, no data loss for outbox items. | M |

## B4. Security (SEC)

| ID | Requirement | Pri |
|---|---|---|
| NFR-SEC-01 | All traffic over TLS (HTTPS/WSS, HSTS); internal data stores are in private subnets, never publicly reachable. | M |
| NFR-SEC-02 | Access tokens are short-lived (15 min); refresh tokens are opaque, rotated, **stored hashed**; reuse detection revokes the family. | M |
| NFR-SEC-03 | Authorization checked in the service layer for every resource (e.g. conversation participant check); covered by tests. | M |
| NFR-SEC-04 | Input validated at every boundary (HTTP, socket, queue payloads) with strict schemas; body-size limits; no raw ORM rows in responses. | M |
| NFR-SEC-05 | Rate limiting and abuse controls on auth, swipes, messages, reports, and uploads (Redis-backed). | M |
| NFR-SEC-06 | Secrets only in a managed secret store; none in the repo, images, or app bundle; secret scanning blocks leaks in CI. | M |
| NFR-SEC-07 | Least-privilege IAM; CI deploys through OIDC federation (no long-lived keys); app DB role cannot alter schema. | M |
| NFR-SEC-08 | Dependency and image vulnerability scanning in CI (audit, CodeQL/Dependabot); critical/high findings block release. | M |
| NFR-SEC-09 | OTP/SMS abuse protection: per-identity/IP limits, spend caps, country allow-list. | M |
| NFR-SEC-10 | Uploaded media is private at rest, served through the CDN with origin access control; EXIF/GPS stripped. | M |
| NFR-SEC-11 | Meets **OWASP ASVS Level 1** baseline before launch; external penetration test is recommended before scaling marketing. | S |
| NFR-SEC-12 | Mobile: tokens only in platform secure storage; no sensitive data in logs/analytics/crash reports; cache cleared on logout/deletion. | M |

## B5. Privacy, compliance & legal (PRIV)

| ID | Requirement | Pri |
|---|---|---|
| NFR-PRIV-01 | Data minimization: collect only what features need; sensitive attributes (gender, preferences, location) restricted and never used for ads. | M |
| NFR-PRIV-02 | Exact location and birthdate are never exposed to other members; distance is bucketed; location updates are throttled. | M |
| NFR-PRIV-03 | **Deletion SLA:** account immediately hidden and sessions revoked; personal data and media purged within **30 days** *(assumed)*; backups age out within the documented backup retention. | M |
| NFR-PRIV-04 | **Export on request** within 30 days *(assumed)*. | S |
| NFR-PRIV-05 | Privacy policy, terms and community guidelines are published and linked in-app and in store listings; consent is recorded and versioned. | M |
| NFR-PRIV-06 | Compliance posture: India **DPDP Act** and **GDPR**-aware (lawful basis/consent, purpose limitation, deletion, breach notification process); legal review before launch. | M |
| NFR-PRIV-07 | App-store compliance: UGC moderation, report/block, account deletion, age rating (17+/Mature), privacy labels/data-safety form accurate. | M |
| NFR-PRIV-08 | Data residency follows the launch region (assumption A1). | S |
| NFR-PRIV-09 | Logs and analytics contain no OTPs, tokens, phone numbers, precise location or message text. | M |

## B6. Data management (DATA)

| ID | Requirement | Pri |
|---|---|---|
| NFR-DATA-01 | PostgreSQL is the system of record; Redis holds only ephemeral/rebuildable state (flushing Redis loses no business data). | M |
| NFR-DATA-02 | Automated backups with **point-in-time recovery**; RPO ≤ 5 min, RTO ≤ 1 h *(assumed)*; restore drill before launch and periodically after. | M |
| NFR-DATA-03 | Integrity enforced in the database (unique pairs, age check, foreign keys), not only in code. | M |
| NFR-DATA-04 | Schema changes follow **expand → migrate → contract**; migrations are reviewed, tested on a clean DB in CI, and never destroy data in the same release. | M |
| NFR-DATA-05 | Messages retained while the match exists; after unmatch/delete retention follows the privacy policy; audit-log entries retained for safety/legal needs. | M |
| NFR-DATA-06 | Object storage versioned; orphaned/incomplete uploads cleaned up by lifecycle rules. | S |

## B7. Usability & accessibility (UX)

| ID | Requirement | Pri |
|---|---|---|
| NFR-UX-01 | Every screen defines **loading, error, empty and offline** states; no dead-end screens or inert buttons. | M |
| NFR-UX-02 | Onboarding completable in ≤ 5 min with progress shown; sign-up reaches the first value (a deck) in as few steps as possible. | M |
| NFR-UX-03 | Accessibility: interactive elements labeled for screen readers; touch targets ≥ 44 pt; **WCAG AA contrast** for body text; usable at 130 % font scale; reduce-motion respected. | M |
| NFR-UX-04 | All user-facing strings externalized (i18n); layouts tolerate longer translations. | M |
| NFR-UX-05 | Error messages are specific and actionable, mapped from stable API error codes. | M |
| NFR-UX-06 | Permission requests happen in context with a primer; denial paths are handled gracefully with a deep link to settings. | M |
| NFR-UX-07 | Consistent visual language through design tokens; no hard-coded colors/sizes. | M |

## B8. Compatibility & portability (COMP)

| ID | Requirement | Pri |
|---|---|---|
| NFR-COMP-01 | iOS and Android phones; minimum OS versions follow the Expo SDK in use (set at scaffold, reviewed each SDK upgrade). | M |
| NFR-COMP-02 | Works on slow/unstable networks (3G-class) for core flows; images and video adapt (compressed uploads, progressive loading). | S |
| NFR-COMP-03 | Phone portrait only in v1; tablet layouts and landscape out of scope. | M |
| NFR-COMP-04 | The backend runs identically in local Docker, staging and production (twelve-factor config via environment). | M |
| NFR-COMP-05 | Vendor lock-in is contained behind interfaces (SMS, push, moderation, mail, storage) so providers can be swapped. | S |

## B9. Observability & operability (OBS)

| ID | Requirement | Pri |
|---|---|---|
| NFR-OBS-01 | Structured JSON logs with request id and user id (no PII), searchable centrally; retention ≥ 30 days. | M |
| NFR-OBS-02 | Metrics and dashboards for RPS, latency percentiles, error rates, DB/Redis health, queue depth/age, active sockets. | M |
| NFR-OBS-03 | Alerts with runbooks for the SLOs in [infra](08-infra-and-operations.md); routed to the on-call channel. | M |
| NFR-OBS-04 | Error and crash reporting for backend and mobile (Sentry) with release tagging and source maps. | M |
| NFR-OBS-05 | Distributed tracing on the swipe and deck paths. | C |
| NFR-OBS-06 | Uptime monitoring from outside the VPC with phone alerts. | M |
| NFR-OBS-07 | Cost visibility: budgets and alerts; resources tagged by environment/service. | M |

## B10. Maintainability & delivery (MAINT)

| ID | Requirement | Pri |
|---|---|---|
| NFR-MAINT-01 | Module boundaries and layering enforced by lint in CI ([architecture](02-architecture.md)); no circular module dependencies. | M |
| NFR-MAINT-02 | TypeScript `strict` in both repos; no `any` without justification. | M |
| NFR-MAINT-03 | Automated CI on every PR: lint, typecheck, unit + integration tests, migration check, OpenAPI diff, security scans; branch protection on `main`. | M |
| NFR-MAINT-04 | **Contract stability:** within `/v1`, API changes are additive-only; breaking changes are detected by CI and require a new version. | M |
| NFR-MAINT-05 | Automated deployment: merge → staging, tag + approval → production; same image promoted; rollback < 15 min. | M |
| NFR-MAINT-06 | Test coverage focuses on risk: race conditions (match creation), auth/session logic, authorization checks, idempotency, outbox/reconnect behavior. | M |
| NFR-MAINT-07 | Docs are code: ADR for each significant decision; architecture docs updated in the same PR as the change. | M |
| NFR-MAINT-08 | Mobile OTA updates restricted to JS-compatible changes via runtime-version fingerprinting; hotfix path < 1 h. | M |
| NFR-MAINT-09 | Infrastructure defined as code (Terraform), reviewed via PR; no manual console changes in staging/prod. | M |

## B11. Cost (COST)

| ID | Requirement | Pri |
|---|---|---|
| NFR-COST-01 | Launch infrastructure kept within the budget set in assumption A4; managed services preferred over self-hosted. | M |
| NFR-COST-02 | SMS spend capped with alerts; push, email and moderation usage monitored per month. | M |
| NFR-COST-03 | Right-sizing review monthly using real metrics; no pre-provisioning for scale not yet observed. | S |

---

# Part C — Traceability

| Roadmap phase | Functional requirements delivered | Key NFRs verified |
|---|---|---|
| **P1** Scaffold + CI/CD | FR-OPS-02 | MAINT-03/05/09, SEC-06/07/08, COMP-04 |
| **P2** Auth | FR-AUTH-01…09, 11, 12, FR-OPS-01, FR-OPS-03 | SEC-02/05/09, REL-03 |
| **P3** Mobile UI port | (client of P2) FR-ACCT-04 scaffold | UX-01/03/04/07, PERF-04 |
| **P4** Profile & media | FR-ONB-*, FR-PROF-01/02/03/05/08, FR-MEDIA-01…05 | PRIV-01/02, SEC-10, UX-02 |
| **P5** Discovery & matches | FR-DISC-*, FR-MATCH-01…04/06, FR-PROF-04/07 | PERF-02/05, SCALE-04/06, REL-03 |
| **P6** Chat & push | FR-CHAT-01…08, FR-NOTIF-01…04/06 | PERF-03, REL-07, SCALE-02 |
| **P7** Safety & lifecycle | FR-SAFE-*, FR-MATCH-05, FR-ACCT-01/02/03/05, FR-AUTH-10, FR-PROF-06, FR-MEDIA-06, FR-CHAT-09 | PRIV-03/04/05/07, DATA-05 |
| **P8** Hardening & launch | FR-OPS-04, FR-ACCT-04 (Hindi) | PERF-*, SCALE-01/06, REL-01/06, DATA-02, SEC-11, OBS-*, COST-* |

## Decisions recorded (owner, 2026-10-25)

| # | Decision | Status |
|---|---|---|
| Q1 | Login: **both phone and email** (OTP on either) | ✅ FR-AUTH-01/05 |
| Q2 | Daily like cap **25**; plans/pricing evaluated after payments exist | ✅ FR-DISC-07 |
| Q3 | Photos: **min 4, max 6** | ✅ FR-ONB-11 |
| Q4 | Gender/orientation: follow the existing Flutter questionnaire; **Hinge is the baseline** | ✅ FR-ONB-03/04, [12](12-hinge-baseline.md) |
| Q5 | **One account per phone number and per email**; no other device limits | ✅ FR-AUTH-12 |
| Q6 | **India only, English only**; localization later | ✅ FR-ACCT-04, assumption A1 |

## Accepted 2026-10-25 (owner: "recommendations are good enough")

| # | Decision | Status |
|---|---|---|
| D1 | Card-style Discover, but likes target a **photo or prompt** with an optional comment | ✅ designed (artboards 18–19) |
| D2 | 3 prompts in onboarding | ✅ FR-ONB-12 |
| D3 | BFF mode hidden in v1 | ✅ FR-ONB-18 |
| D4 | Passwordless OTP, no password step | ✅ ADR-0006 |
| D5 | Gender {woman, man, non-binary} + interested-in is enough for launch | ✅ |
| Q7 | Read receipts off by default | ✅ Settings, Privacy |
| Q8 | Reports reviewed by the owner in a queue, target 24 h | ✅ FR-SAFE-04 |

## Open questions that still change requirements (superseded above; kept for history)

| # | Question | Affects | Recommendation |
|---|---|---|---|
| D1 | Swipe deck vs Hinge-style "like a photo/prompt (+ comment)" | FR-MATCH-01, FR-DISC-*, mobile discovery UI | Card stack for browsing, likes target a photo/prompt with optional comment |
| D2 | Include 3 prompts in v1? | FR-ONB-12 | Yes |
| D3 | Keep BFF mode? | FR-ONB-18, FR-DISC-02 | Hide for v1 |
| D4 | Keep passwords (prototype has a password step) or go passwordless OTP? | FR-AUTH-*, ADR-0006 | Passwordless |
| D5 | Is gender {woman, man, non-binary} + interested-in enough for launch (no separate sexuality/pronouns)? | FR-ONB-03/04 | Yes for v1 |
| Q7 | **Read receipts** — see explanation below; default on or off? | FR-CHAT-07 | Off by default, opt-in |
| Q8 | Who handles **user reports** (abuse flags) and how fast? | FR-SAFE-04 | Owner reviews in a queue, target 24 h |

### What Q7 and Q8 mean

- **Read receipts (Q7):** the small "Seen" / double-tick shown under your message once the other person has opened the chat. Question: should that be **on for everyone by default** (sender always sees "Seen"), or **off unless a member turns it on**? Privacy-friendly default is off; many apps default on.
- **Reports (Q8):** a member taps **"Report"** on a profile, photo or message (e.g. fake profile, harassment, inappropriate photo, underage). That creates a *report* record that a **person must review** and act on (dismiss, remove photo, suspend). Question: who reviews them in v1 (you?) and what response time you commit to (e.g. within 24 h). The stores expect a working process for this on dating apps.
