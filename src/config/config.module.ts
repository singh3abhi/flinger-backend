import { existsSync } from 'node:fs';
import { Global, Module } from '@nestjs/common';
import { parseEnv, type Env } from './env.schema';

/** Injection token for the validated configuration. */
export const APP_CONFIG = Symbol('APP_CONFIG');
export type AppConfig = Env;

let cached: AppConfig | undefined;

/**
 * Load and validate configuration from process.env (memoized). Throws on invalid config.
 * For local development a `.env` file in the working directory is read first; variables already
 * set in the environment win. Deployed images contain no `.env` (see .dockerignore).
 */
export function loadConfig(): AppConfig {
  if (!cached && existsSync('.env')) process.loadEnvFile('.env');
  cached ??= parseEnv(process.env);
  return cached;
}

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: loadConfig }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
