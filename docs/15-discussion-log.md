# 15 — Discussion log

Things that need a decision or a conversation. We keep building around them with a sensible default and come back here to settle them. Newest items at the bottom of each section.

**How to use:** when something is decided, move it to *Decided* with the date and the outcome, and update the doc it affects. When the build hits a new question, add it under *Open* with the default being used meanwhile.

## Open

| # | Topic | Question | Default meanwhile | Raised |
|---|---|---|---|---|
| D-01 | Places data | Which dataset fills `places` (city labels): GeoNames, OpenStreetMap, government directory, or a paid Indian API? Verify GeoNames coverage of Indian cities first (needs a download). | GeoNames India subset, city-level | 2026-10-25 |
| D-02 | Location screens | Built: "Enter my city instead" removed; a denied permission shows "Location is off" with Open Settings. Still to do: update the design canvas and write the location ADR. | GPS required (decided) | 2026-10-25 |
| D-03 | Passes | Keep passes forever, or let people reappear after ~30 days? | Forever | 2026-10-25 |
| D-04 | Daily likes | Reset at a fixed time (04:00 IST) or 24 h after the first like? | 04:00 IST | 2026-10-25 |
| D-05 | Reports | Who reviews reports and how fast? | Owner, queue via SQL, within 24 h | 2026-10-25 |
| D-06 | Privacy | Offer "hide my city" in addition to rounded distance? | No | 2026-10-25 |
| D-07 | Causes list | The list has US-centric items (Black Lives Matter, Stop Asian hate). Replace with an India-relevant list? | Keep the Flutter list | 2026-10-25 |
| D-08 | Religion list | "Mormon" and "Latter-day Saint" were dropped for India. Confirm. | Dropped | 2026-10-25 |
| D-09 | Prompt library | The ~30 prompts and their wording. | Placeholder prompts in seed data | 2026-10-25 |
| D-10 | Legal | Terms, Privacy Policy, Community Guidelines text and URLs; DPDP review. Needed before store submission. | Placeholder links | 2026-10-25 |
| D-11 | Accounts and vendors | Email provider for UAT/prod (SES or other), Firebase (FCM), AWS (S3, moderation); SMS provider and DLT for Phase 1. | Local Mailpit only | 2026-10-25 |
| D-12 | App identifiers | Permanent iOS/Android bundle id (e.g. `<domain>.flinger`). Needed before the first TestFlight/Play build. | `app.flinger.mobile` placeholder for local dev | 2026-10-25 |
| D-13 | Git author name | Commits in the personal repos show the name `abhinavSpyne` (from global git config). Which name to use? | Unchanged | 2026-10-25 |
| D-14 | Precise vs approximate GPS | iOS/Android let people share only approximate location (a few km). Accept it, or require precise? | Accept approximate | 2026-10-25 |
| D-15 | Upgrades | When to move to NestJS 12 / TypeScript 7 (blocked on nestjs-zod support). | Stay on Nest 11 / TS 5.9 | 2026-10-25 |
| D-16 | Docker image size | Runtime image is ~448 MB; can be trimmed (distroless/alpine, prune). | Later, with infra | 2026-10-25 |
| D-17 | Mobile styling | NativeWind was deferred; the app uses StyleSheet on typed tokens (mobile ADR-0007). Revisit when `flinger-web` starts, for a shared class vocabulary? | StyleSheet + tokens | 2026-10-25 |
| D-18 | Logo color | The logo asset is a brighter orange (#FF4000-ish) than the Theme B accent (#E4572E). "Keep logo as it is" was decided; confirm it should stay brighter than the UI accent. | Logo unchanged | 2026-10-25 |
| D-19 | Height range | Heights accepted: 120–230 cm (picker in cm, with feet/inches shown). OK? | 120–230 cm | 2026-10-26 |
| D-20 | Resuming onboarding | Resume goes to the first missing *required* step. Someone who quits right after Values skips the optional Kids/Beliefs/Causes screens on resume (they can fill them in from Edit profile). Acceptable, or should we remember skipped screens? | Skip on resume | 2026-10-26 |
| D-21 | "Everyone" on Who to meet | "Everyone" is saved as all three options (men, women, non-binary), not a separate value. | All three | 2026-10-26 |
| D-22 | Photo moderation | Locally photos are auto-approved. UAT/production use `manual` (pending until reviewed) until an automated service (e.g. Amazon Rekognition) is added. Pending photos count towards onboarding but are not shown to others. Who reviews, and how fast? | Manual, pending until reviewed | 2026-10-26 |
| D-23 | Local object storage | MinIO no longer publishes Docker images, so local S3 is SeaweedFS (Apache-2.0). Production stays Amazon S3. OK? | SeaweedFS locally | 2026-10-26 |
| D-24 | India boundary and places data | The service-area check is a rough box (it includes slivers of neighbouring countries) and city labels come from a hand-written list of 66 cities. Both are fixed by the places dataset decision (D-01): GeoNames IN for cities and an India boundary polygon. | Box + 66 cities | 2026-10-26 |
| D-25 | Location rules | Accuracy worse than 10 km is refused; fixes older than 10 min refused; impossible travel = over 50 km at over 1000 km/h (ignored and flagged, not refused). Review once real data exists. | As stated | 2026-10-26 |
| D-26 | Default preferences | New members see people within 5 years of their own age (at least a 10-year window) and 50 km. Hinge-like; change? | ±5 years, 50 km | 2026-10-26 |
| D-27 | Simulated GPS in testing | iOS marks the Simulator's location as simulated, so the API refuses it (good). `LOCATION_ALLOW_MOCKED=true` lets local and UAT testers use simulators; it is refused in production. Keep it on in UAT? | On locally, off elsewhere | 2026-10-26 |
| D-28 | Ranking weights | v1 weights: activity 2.0, distance 1.5, intentions 2.0, values 0.8, causes 0.4, family plans 0.6, profile quality 0.8, they-liked-you 3.0, new member (72 h) 1.0, jitter 0.3. Tune with real data. | As listed | 2026-10-26 |
| D-29 | Liked You visibility | Everyone who liked you is shown with their photo and comment (free). Hinge blurs most of them behind a subscription; that is the obvious paid feature later. | Show all, free | 2026-10-26 |
| D-30 | Deck refill | The API refills a member's deck synchronously when fewer than 5 cards are left (~1 query). Move to a background worker before launch traffic? | Synchronous for now | 2026-10-26 |
| D-31 | Push vendor | Built behind an interface with the Expo Push Service (one API for APNs and FCM; fits our Expo app). The plan said FCM directly. Expo needs an Expo account/project id; FCM direct needs Firebase + APNs keys. | Expo push | 2026-10-26 |
| D-32 | Push delivery | Pushes are sent inline, best effort, after the request. Move to a BullMQ queue in the worker (retries, receipts) before launch. | Inline | 2026-10-26 |
| D-33 | Message partitioning | `messages` is one table for now; monthly partitions when volume needs it (an expand/migrate step). | Not partitioned | 2026-10-26 |
| D-34 | Push text | Push shows the sender's first name and "Sent you a message", never the message text. Show a preview instead (Hinge does), or hide the name too? | Name, no text | 2026-10-26 |
| D-35 | Read receipts | Read positions are stored (unread counts) but not shown to the other person until the read-receipts setting exists (F5, default off). | Not shown | 2026-10-26 |

## Decided

| # | Topic | Outcome | Date |
|---|---|---|---|
| — | Theme | Cream and ember (option B); orange only as an accent | 2026-10-25 |
| — | Logo | Keep the original `#FF4000` logo | 2026-10-25 |
| — | Dark mode | Not in v1 | 2026-10-25 |
| — | Location | GPS required; no manual city; changing location is a future paid feature | 2026-10-25 |
| — | City gating | No launch gating; everyone in India can use the app; radius widens in sparse areas | 2026-10-25 |
| — | GitHub Actions | Off until the app works end to end (templates in `docs/ci/`) | 2026-10-25 |
| — | Sign-in | Phone and email; Phase 0 ships email OTP, phone in Phase 1; passwordless | 2026-10-25 |
| — | Product | Hinge-style likes on a photo or prompt with a comment; 3 prompts; 4–6 photos; 25 likes/day; BFF hidden | 2026-10-25 |
| — | Dev runtime | During early features the app runs in Expo Go on the simulator; a development build is made when a native module needs it (push, etc.) | 2026-10-25 |
