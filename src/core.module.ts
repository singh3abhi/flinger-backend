import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { ProblemDetailsFilter } from '@/common/errors/problem-details.filter';
import { buildLoggerParams } from '@/common/logging/logger.config';
import { APP_CONFIG, ConfigModule, type AppConfig } from '@/config/config.module';
import { DatabaseModule } from '@/infra/database/database.module';
import { TransactionManager } from '@/infra/database/transaction.manager';
import { RedisModule } from '@/infra/redis/redis.module';

/**
 * Everything every process mode needs: validated config, structured logging, Postgres, Redis,
 * and the global validation / serialization / error handling. api, realtime and worker all import it.
 */
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
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    TransactionManager,
  ],
  exports: [TransactionManager],
})
export class CoreModule {}
