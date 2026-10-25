import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { exitOnFailure } from './bootstrap/bootstrap-http';
import { loadConfig } from './config/config.module';
import { WorkerModule } from './worker.module';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  // No queue processors exist yet (they arrive with the email/SMS jobs in phase P2), so keep the
  // process alive and shut down cleanly on SIGTERM/SIGINT.
  const keepAlive = setInterval(() => undefined, 60_000);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      clearInterval(keepAlive);
      void app.close();
    });
  }
  logger.log(`worker started (${config.APP_ENV})`);
}

main().catch(exitOnFailure);
