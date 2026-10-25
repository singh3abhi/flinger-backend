# ADR-0006 — JWT access + rotating refresh tokens; phone-OTP primary login

**Status:** Proposed (needs owner confirmation of phone-OTP, assumption A2) · 2026-10-25

## Context
Legacy: cookie sessions in Redis, email → OTP → set password → sign-in, with a security gap in set-password. Mobile clients work better with tokens; dating apps usually favor phone-number identity to reduce fake accounts.

## Decision
- Passwordless: **phone OTP** primary; Sign in with Apple / Google; email OTP fallback.
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
