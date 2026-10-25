import type { INestApplication, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { APP_CONFIG, loadConfig, type AppConfig } from '@/config/config.module';
import { configureApp } from './configure-app';

/** Print the error and exit non-zero so the orchestrator sees the failure (never exit 0). */
export function exitOnFailure(error: unknown): never {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

export async function bootstrapHttp(
  rootModule: Type<unknown>,
  mode: string,
  /** Extra setup before listening (e.g. the WebSocket adapter for the realtime process). */
  prepare?: (app: INestApplication, config: AppConfig) => void,
): Promise<void> {
  // Validate configuration first so a bad environment fails with one clear message.
  loadConfig();
  const app = await NestFactory.create(rootModule, { bufferLogs: true });
  const config = app.get<AppConfig>(APP_CONFIG);
  configureApp(app, config);
  prepare?.(app, config);
  await app.listen(config.PORT, '0.0.0.0');
  app.get(Logger).log(`${mode} listening on :${config.PORT} (${config.APP_ENV})`);
}
