# ADR-0006 — Passwordless OTP login (phone **and** email); JWT access + rotating refresh tokens

**Status:** **Accepted** 2026-10-25 — both phone and email; passwordless (D4 accepted); JWT + rotating refresh. **Sequencing:** Phase 0 launch uses **email OTP**; **phone OTP ships in Phase 1** after an SMS provider and India DLT registration are in place.

## Context
Legacy: cookie sessions in Redis, email → OTP → set password → sign-in, with a security gap in set-password. Mobile clients work better with tokens; dating apps usually favor phone-number identity to reduce fake accounts.

## Decision
- **Phone OTP and email OTP are both first-class** sign-in methods; **one account per phone number and per email** (unique identities; a member can attach the second identity after verifying it). Sign in with Apple / Google remain optional later.
- **Passwordless** (recommended; see D4): no password step. The prototype's password rule (4–12 chars) would be too weak to ship anyway.
- **Access JWT (15 min)** + **opaque rotating refresh token (30 d)** stored hashed; reuse detection revokes the token family.
- Mobile stores the refresh token in the platform secure store.
Details in [auth & security](../05-auth-and-security.md).

## Consequences
- ✅ No password storage/reset flows; fewer attack surfaces; lower sign-up friction.
- ✅ Works for mobile and later web (web would keep the refresh token in an httpOnly cookie).
- ⚠️ SMS cost and deliverability (India DLT, OTP pumping) → provider interface, spend caps, country allow-list.
- ⚠️ SIM-swap risk accepted for v1; add optional second factor later.

## Alternatives
Email + password (Argon2id) — simpler vendor-wise, more flows/risk; cookie sessions — awkward on mobile; third-party IdP (Auth0/Cognito/Firebase Auth) — faster to start but adds vendor coupling and cost; revisit if auth becomes a time sink.
