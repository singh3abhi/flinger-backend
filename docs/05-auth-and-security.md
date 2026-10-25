# 05 — Auth & Security

Status: Draft v0.1 · Related: [ADR-0006](adr/0006-auth-jwt-phone-otp.md) (Proposed)

## 1. Authentication

### 1.1 Identity methods — `Proposed`
- **Primary:** phone number + OTP (lowest friction, discourages mass fake accounts)
- **Also:** Sign in with Apple (required by App Store if any other social login is offered), Google
- **Fallback:** email OTP (also used by account recovery)
- **No passwords in v1.** (The legacy flow: email → OTP → set password → sign-in. Dropping the password removes reset flows, breach risk and a whole class of bugs.) If the owner prefers passwords, the plan is Argon2id and a proper reset-token flow — recorded as an alternative in the ADR.

### 1.2 Tokens
| Token | Form | Lifetime | Storage (client) |
|---|---|---|---|
| Access | JWT (EdDSA/ES256 or HS256 with rotation), claims: `sub`, `sid` (session), `iat`, `exp`; no PII | 15 min | memory only |
| Refresh | Opaque random 256-bit, **stored hashed** server-side | 30 days, **rotating** | `expo-secure-store` (Keychain / Keystore) |

**Rotation with reuse detection:** every `/auth/refresh` issues a new refresh token and marks the old one `replaced_by`. Presenting an already-replaced token means theft → revoke the entire `family_id` and force re-login.

**Sessions:** one row family per device. A user may have multiple devices; "log out everywhere" revokes all families. (The legacy "single active session" rule is intentionally not carried over — it logs users out of old phones silently and is confusing; revisit if product wants it.)

### 1.3 OTP rules (fixing the legacy gaps)
- 6 digits, generated with a CSPRNG, stored **hashed** in Redis, TTL 10 min
- Resend cooldown 120 s; **max 5 verification attempts per OTP**, then lock + delete OTP
- Per-identity and per-IP request limits (e.g. 5 OTP requests/hour/identity, 20/hour/IP)
- Verification is a single call that returns tokens — there is **no separate "set password with just an email"** step that an attacker could call (legacy `POST /auth/setPassword` accepted only an email)
- Never log OTPs; in dev, deliver to Mailpit / a log-only SMS provider guarded by `NODE_ENV`

### 1.4 Authorization
- `JwtAuthGuard` global; `@Public()` opts out
- Resource checks live in services (e.g. "is the caller a participant of this conversation?") and are unit-tested
- Status gate: `suspended`/`deleted` users are rejected at the guard; `pending` users can only reach onboarding endpoints

## 2. Abuse & safety controls

| Control | Detail |
|---|---|
| Rate limiting | `@nestjs/throttler` with Redis storage: global, per-route (auth tight), per-user (swipes, messages) |
| Swipe quota | Daily like cap (configurable), anti-bot velocity checks |
| Block / report | In v1 ([data model](03-data-model.md)); blocked users vanish from decks and chats |
| Photo moderation | Automated (Rekognition or similar) before `approved`; reported photos re-queued |
| Age gate | Birthdate ≥ 18 enforced server-side (not just UI) |
| Message safety | Report-from-chat; link/contact-info heuristics later |
| Fake accounts | Phone verification, per-device account limits, optional selfie verification (post-v1) |

## 3. Application security baseline

- **Transport:** HTTPS/WSS only (HSTS); TLS terminated at ALB; internal traffic inside VPC private subnets
- **Headers:** `helmet`; CORS allow-list for web origins (mobile ignores CORS); no wildcard in prod
- **Input:** Zod validation on every request/socket payload; max body sizes; media validated by magic bytes in the worker
- **Output:** explicit response DTOs; no ORM rows leaked
- **Secrets:** AWS Secrets Manager / SSM Parameter Store → injected as env at task start; **never** in the repo or images; `.env.example` has keys only. Secret scanning (gitleaks) in CI
- **IAM:** least privilege task roles; CI uses GitHub **OIDC** to assume a deploy role — no long-lived AWS keys
- **Dependencies:** Dependabot + `pnpm audit` in CI; lockfile committed; pinned base image digests
- **Database:** private subnets, no public access, TLS required, separate migration vs app DB users (app user cannot `DROP`/`ALTER`)
- **Uploads:** presigned PUT with content-type + size limits; bucket is private, served via CloudFront OAC; EXIF/GPS stripped
- **Logging:** structured, PII-minimized; access logs retained 30–90 days
- **Cross-user data:** distance is bucketed; exact location, birthdate (only age), phone/email never exposed to other users

## 4. Privacy & compliance (to finalize with a lawyer before launch)

- Privacy policy + terms + community guidelines linked in-app and on store listings
- **Consent** for location and notifications at the moment of need (OS prompts after an in-app primer)
- **Deletion** in-app (required by Apple & Google) per the lifecycle in [data model §7](03-data-model.md)
- **Export** on request
- India DPDP / GDPR-aware data handling; data residency follows launch region (assumption A1)
- Sensitive attributes (gender, orientation preferences) are special-category-like: store minimally, restrict access, never use for ads
- Store listings require: UGC moderation description, report/block, and age rating (17+/Mature)

## 5. Threat model (initial, STRIDE-lite)

| Threat | Example | Mitigation |
|---|---|---|
| Spoofing | Stolen refresh token | Rotation + reuse detection, secure storage, device binding (`X-Device-Id`) |
| Tampering | Client forges `birthdate` | Server-side validation; immutable-after-set with support flow |
| Repudiation | "I never sent that" | Server-assigned message ids, audit log for moderation actions |
| Info disclosure | Location triangulation by repeated queries | Distance bucketing, rate limits on deck, jittered location |
| DoS | OTP / SMS pumping | Per-IP + per-identity limits, WAF, SMS-provider spend caps and country allow-list |
| Elevation | Accessing other users' conversations | Participant check in service layer, tested |
