import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

/**
 * Every environment variable the backend reads. This is the single source of truth:
 * if a variable is not here, the code must not read it.
 */
export const envSchema = z.object({
  /** Which deployment this is. */
  APP_ENV: z.enum(['local', 'uat', 'production']).default('local'),
  /** Library behaviour (Nest, Express, pino). */
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Which entry point this process runs. */
  APP_MODE: z.enum(['api', 'realtime', 'worker']).default('api'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Build identifier (git sha in CI). Shown in the OpenAPI document and logs. */
  APP_VERSION: z.string().min(1).default('dev'),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),

  /** Allowed web origins. Mobile apps ignore CORS. */
  CORS_ORIGINS: csv,

  /** Number of reverse-proxy hops (load balancer) whose X-Forwarded-For to trust. 0 locally. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  /** Signs short-lived access tokens (HS256). At least 32 characters. */
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

  /** Server-side secret mixed into stored OTP hashes. At least 16 characters. */
  OTP_PEPPER: z.string().min(16, 'must be at least 16 characters'),
  /** Sign-in codes: how long they live, and how many wrong guesses are allowed. */
  OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(1800).default(600),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(600).default(120),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  /** Test accounts (non-production only): these emails always get OTP_TEST_CODE and no email is sent. */
  OTP_TEST_EMAILS: csv,
  OTP_TEST_CODE: z
    .string()
    .regex(/^\d{6}$/, 'must be 6 digits')
    .default('123456'),

  /** Outgoing email. Locally this is Mailpit (smtp://localhost:1025). */
  MAIL_SMTP_URL: z.string().min(1).default('smtp://localhost:1025'),
  MAIL_FROM: z.string().min(3).default('Flinger <no-reply@flinger.app>'),

  /** Oldest app version still served. Older apps get APP_UPDATE_REQUIRED (HTTP 426). */
  MIN_APP_VERSION: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'must look like 1.2.3')
    .default('1.0.0'),
});

export type Env = z.infer<typeof envSchema>;

/** Rules that span several variables. */
function crossChecks(env: Env): string[] {
  const problems: string[] = [];
  if (env.APP_ENV === 'production' && env.OTP_TEST_EMAILS.length > 0) {
    problems.push('OTP_TEST_EMAILS: must be empty when APP_ENV=production');
  }
  return problems;
}

/**
 * Parse and validate environment variables. Throws one readable error listing every problem.
 * Callers (entry points) must exit non-zero on failure.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const crossProblems = crossChecks(result.data);
  if (crossProblems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${crossProblems.map((line) => `  - ${line}`).join('\n')}`,
    );
  }
  return result.data;
}
