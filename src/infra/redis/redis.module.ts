import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';

export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Redis => {
        const logger = new Logger('Redis');
        const client = new Redis(config.REDIS_URL, {
          lazyConnect: true,
          // Fail fast instead of queueing commands while Redis is down.
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          retryStrategy: (attempt) => Math.min(attempt * 200, 2_000),
        });
        client.on('error', (err) => logger.warn(`Redis error: ${err.message}`));
        return client;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisModule.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleInit(): Promise<void> {
    // Do not block boot on Redis: readiness reports it, and ioredis keeps retrying in the background.
    this.redis
      .connect()
      .catch((err: Error) => this.logger.warn(`Initial Redis connect failed: ${err.message}`));
  }

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
