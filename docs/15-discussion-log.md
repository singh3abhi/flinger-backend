# 15 — Discussion log

Things that need a decision or a conversation. We keep building around them with a sensible default and come back here to settle them. Newest items at the bottom of each section.

**How to use:** when something is decided, move it to *Decided* with the date and the outcome, and update the doc it affects. When the build hits a new question, add it under *Open* with the default being used meanwhile.

## Open

| # | Topic | Question | Default meanwhile | Raised |
|---|---|---|---|---|
| D-01 | Places data | Which dataset fills `places` (city labels): GeoNames, OpenStreetMap, government directory, or a paid Indian API? Verify GeoNames coverage of Indian cities first (needs a download). | GeoNames India subset, city-level | 2026-10-25 |
| D-02 | Location screens | Remove "Enter my city instead" from the Location screen and add a blocking "Location is off" screen; write the location ADR. | GPS required (decided), design update pending | 2026-10-25 |
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
