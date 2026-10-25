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

  /** Oldest app version still served. Older apps get APP_UPDATE_REQUIRED (HTTP 426). */
  MIN_APP_VERSION: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'must look like 1.2.3')
    .default('1.0.0'),
});

export type Env = z.infer<typeof envSchema>;

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
  return result.data;
}
