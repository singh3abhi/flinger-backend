import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { ProblemDetailsFilter } from '@/common/errors/problem-details.filter';
import { buildLoggerParams } from '@/common/logging/logger.config';
import { APP_CONFIG, ConfigModule, type AppConfig } from '@/config/config.module';
import { DatabaseModule } from '@/infra/database/database.module';
import { TransactionManager } from '@/infra/database/transaction.manager';
import { MailModule } from '@/infra/mail/mail.module';
import { RateLimiter } from '@/infra/redis/rate-limiter.service';
import { RedisModule } from '@/infra/redis/redis.module';
import { RealtimeInfraModule } from '@/infra/realtime/realtime.module';
import { StorageModule } from '@/infra/storage/storage.module';

/**
 * Everything every process mode needs: validated config, structured logging, Postgres, Redis,
 * and the global validation / serialization / error handling. api, realtime and worker all import it.
 * Global so feature modules can inject TransactionManager and RateLimiter without re-importing it.
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => buildLoggerParams(config),
    }),
    DatabaseModule,
    RedisModule,
    MailModule,
    StorageModule,
    RealtimeInfraModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    TransactionManager,
    RateLimiter,
  ],
  exports: [TransactionManager, RateLimiter],
})
export class CoreModule {}
