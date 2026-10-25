# 10 — Legacy Migration (`flinger-node` → `flinger-backend`)

The original Express/Mongo service (`flinger-node`, 1 commit, ~1,470 lines of TypeScript) covered email sign-up with OTP and sign-in. It is kept as **reference only** and is replaced, not ported line-by-line. There is **no data to migrate** (no production users).

## What to carry over (ideas, not code)

| Legacy | Keep as | Where |
|---|---|---|
| Sign-up state machine ("next step" codes returned to the client) | The idea of server-driven next steps, adapted to the new onboarding states | `auth` / `users` status |
| OTP: hashed code in Redis, 10-min TTL, 120 s resend cooldown | Same parameters, add attempt limit | `auth` module |
| BullMQ email job with retries/backoff | Nest BullMQ processors (`@nestjs/bullmq`) | `worker` mode |
| Zod request validation | `nestjs-zod` DTOs | all modules |
| Layering (controller → service → repository) | Same, enforced by module rules | [architecture](02-architecture.md) |
| pino logging, helmet, compression, rate limiting | Same libraries via Nest equivalents | `common/`, `config/` |

## Defects found in the legacy service — do **not** reproduce

| # | Defect | Where (legacy) | Fix in new design |
|---|---|---|---|
| 1 | `POST /auth/setPassword` takes only an email: anyone who knows a verified email can set that account's password | `set-password-controller.ts` | No separate set-password step; OTP verification returns tokens directly ([auth](05-auth-and-security.md)) |
| 2 | No cap on OTP verification attempts (6-digit code brute-forceable within TTL) | `otp.service.ts` | Max 5 attempts, then lock + invalidate |
| 3 | Production error masking never runs: compares `ENVIRONMENT == "prodction"` (typo) and then falls through to send a second response | `error-handler.ts` | Single global problem+json filter, tested in prod mode |
| 4 | OTP printed with `console.log` | `otp.service.ts` | Never log secrets; fake SMS provider in dev only |
| 5 | Weak OTP hashing cost (`OTP_SALT_ROUNDS = 6`) and OTP stored via bcrypt with no pepper | `auth.constants.ts` | HMAC with server secret (OTP is short-lived and rate-limited) or stronger cost |
| 6 | Invalid env config exits with `process.exit(0)` (looks like success to orchestrators) | `env_config.ts` | Exit non-zero; fail fast in CI |
| 7 | Session CSRF token issued but never verified; no auth middleware or logout route | `sign-in-controller.ts`, routes | Stateless JWT + refresh; guards on all routes; logout revokes token family |
| 8 | Hardcoded placeholder CORS origin; `secure` cookie flag commented out | `app.ts`, `session-store.ts` | Config-driven allow-list; no cookies for mobile |
| 9 | `.gitignore` lacks `.env` | `.gitignore` | `.env*` ignored from the first commit (already in this repo) |
| 10 | Reset-password is a stub | `auth.service.ts` | Passwordless → not needed; email OTP recovery |

## Data-store change

MongoDB/Mongoose → **PostgreSQL + Drizzle** ([ADR-0002](adr/0002-postgres-postgis.md), [ADR-0005](adr/0005-drizzle-orm.md)). The only legacy model (`User`: name, email, passwordHash, emailVerified) maps to `users` + `auth_identities` + `profiles`; no password column is carried.

## Plan for the old repo

1. Keep `flinger-node` read-only for reference until phase 2 is complete.
2. After auth parity is verified, archive the GitHub repo (do not delete).
3. Same for `flinger-flutter` after the UI port is accepted (see mobile `docs/04-flutter-migration.md`).
