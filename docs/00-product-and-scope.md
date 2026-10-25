# 00 — Product & Scope

## Product

Flinger is a mobile-first dating app. Tagline in the existing app: *"Flings, Love & Stories"*; landing copy: *"Meet people who feel real"*. Platforms: iOS and Android first (React Native), web later.

## Guiding principle

**Ship v1 fast on boring, managed technology — but draw boundaries now so scaling is a configuration change, not a rewrite.**

Concretely:
- One deployable codebase (modular monolith), three process modes (api / realtime / worker).
- Managed data services (Postgres, Redis, object storage). No self-hosted databases.
- Every feature that is expensive to retrofit (block/report, moderation, account deletion, rate limiting, idempotency, API versioning) is in v1. Features that are cheap to add later (premium, boosts, video) are not.

## v1 scope — `Assumed`

> Detailed, testable requirements (IDs, priorities, roadmap phase) are in [11 — Requirements](11-requirements.md). This section is the summary.

> The owner has not yet confirmed the v1 feature list. This is the proposed MVP cut; change it here first.

**In v1**
1. Sign-up / sign-in with **phone or email, via OTP** (per [ADR-0006](adr/0006-auth-jwt-phone-otp.md)); one account per phone and per email; age gate (18+)
2. Onboarding: the 11-step questionnaire already designed in the Flutter app (name, birthdate, gender, who to meet, intentions, height, values, kids/family, religion/politics, causes) with **4–6 photos**, plus preferences (age range, distance). Hinge is the baseline — see [12](12-hinge-baseline.md)
3. Location capture (coarse, city-level display)
4. Discovery: swipe deck (like / pass), distance + age + preference filtering
5. Matching: mutual like creates a match
6. Chat: 1:1 text messages between matches, typing + read receipts
7. Push notifications: new match, new message
8. Safety: block, report, photo moderation, account deletion, unmatch
9. Basic settings: edit profile, preferences, pause account, delete account

**Explicitly out of v1** (design must not preclude them)
- Premium / payments / boosts / super-likes beyond a counter
- Video profiles, voice notes, media in chat (images in chat is a fast follow); BFF mode (decision D3)
- Web app (`flinger-web`), admin console (use SQL + a minimal internal script until needed)
- Selfie / ID verification (planned fast-follow; schema reserves `verification_status`)
- ML ranking (v1 uses a rules-based score), multi-language beyond English/Hindi scaffolding
- Multi-region deployment

## Non-functional targets — `Assumed`

| Area | Target (v1 launch) |
|---|---|
| Availability | 99.5% API (single region, Multi-AZ managed data) |
| API latency | p95 < 300 ms for reads, < 500 ms for writes (excluding media upload) |
| Chat delivery | p95 < 1 s end-to-end for online recipients |
| Data durability | Point-in-time recovery on Postgres; S3 versioning for media |
| Security | OWASP ASVS L1 baseline; no secrets in repo; least-privilege IAM |
| Privacy | GDPR / India DPDP-aware: consent, export, deletion |

## Assumptions to confirm (owner)

| # | Question | Working assumption |
|---|---|---|
| A1 | Launch market | ✅ **India only** (confirmed). Affects region `ap-south-1`, SMS provider, DLT rules, payments approach |
| A2 | Login method | ✅ **Phone OTP and email OTP, both first-class** (confirmed); Apple/Google optional later |
| A3 | Cloud | AWS |
| A4 | Monthly infra budget at launch | Low hundreds of USD; optimize for managed + small instance sizes |
| A5 | Team | Solo owner + Claude; optimize for low operational burden |
| A6 | Monetization at launch | None (free). **25 likes/day cap** from day one; plans evaluated once payments exist |
| A7 | Languages | ✅ **English only** at launch (confirmed); localization later, Hindi first |

## Success criteria for the plan

A new developer can read `docs/` and answer: what are we building, how is it structured, how do I run it, how does it ship, and what is next — without asking.
