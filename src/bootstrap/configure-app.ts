import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { AppConfig } from '@/config/config.module';
import { setupOpenApi } from '@/openapi/openapi';

/** Routes served at the root, outside the /v1 prefix (container and load-balancer probes). */
export const UNVERSIONED_ROUTES = ['health', 'ready'];

/**
 * Cross-cutting HTTP setup shared by the real entry points and the e2e tests, so tests exercise
 * exactly what production runs.
 */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.useLogger(app.get(Logger));
  // Behind a load balancer the real client IP is in X-Forwarded-For; rate limits depend on it.
  (app.getHttpAdapter().getInstance() as { set(name: string, value: unknown): void }).set(
    'trust proxy',
    config.TRUST_PROXY_HOPS,
  );
  app.use(helmet());
  app.enableCors({ origin: config.CORS_ORIGINS.length > 0 ? config.CORS_ORIGINS : false });
  app.setGlobalPrefix('v1', { exclude: UNVERSIONED_ROUTES });
  app.enableShutdownHooks();
  if (config.APP_ENV !== 'production') setupOpenApi(app);
}
