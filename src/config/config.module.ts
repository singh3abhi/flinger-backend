import { Global, Module } from '@nestjs/common';
import { parseEnv, type Env } from './env.schema';

/** Injection token for the validated configuration. */
export const APP_CONFIG = Symbol('APP_CONFIG');
export type AppConfig = Env;

let cached: AppConfig | undefined;

/** Load and validate configuration from process.env (memoized). Throws on invalid config. */
export function loadConfig(): AppConfig {
  cached ??= parseEnv(process.env);
  return cached;
}

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: loadConfig }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
