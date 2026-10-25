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

  /**
   * Photo storage (S3). Locally SeaweedFS from docker compose; in AWS leave the endpoint and keys
   * unset so the SDK uses the task role. S3_PUBLIC_ENDPOINT is the host devices upload to
   * (presigned URLs are signed for it); defaults to S3_ENDPOINT.
   */
  S3_BUCKET: z.string().min(3).default('flinger-photos-local'),
  S3_REGION: z.string().min(1).default('ap-south-1'),
  S3_ENDPOINT: z.url().optional(),
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * How new photos are reviewed. `auto_approve` is for local development only; `manual` keeps them
   * pending until a moderator (or the moderation service, later) decides.
   */
  PHOTO_MODERATION: z.enum(['manual', 'auto_approve']).default('manual'),

  /**
   * Accept locations the device marks as simulated (iOS Simulator, Android emulator, fake-GPS
   * apps). For development and UAT testing only; never in production.
   */
  LOCATION_ALLOW_MOCKED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  /**
   * Push notifications: `log` (local: records that a push would be sent, no content) or `expo`
   * (Expo Push Service, which delivers through APNs and FCM). Vendor choice: discussion log D-31.
   */
  PUSH_PROVIDER: z.enum(['log', 'expo']).default('log'),
  /** Optional Expo access token (required once "enhanced push security" is on in the Expo project). */
  EXPO_ACCESS_TOKEN: z.string().min(1).optional(),

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
  if (Boolean(env.S3_ACCESS_KEY_ID) !== Boolean(env.S3_SECRET_ACCESS_KEY)) {
    problems.push('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY: set both or neither');
  }
  if (env.APP_ENV === 'production' && env.LOCATION_ALLOW_MOCKED) {
    problems.push('LOCATION_ALLOW_MOCKED: must be false when APP_ENV=production');
  }
  if (env.APP_ENV !== 'local' && env.PHOTO_MODERATION === 'auto_approve') {
    problems.push('PHOTO_MODERATION: auto_approve is only allowed when APP_ENV=local');
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
