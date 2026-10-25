import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';
import { DevicesController } from './devices.controller';
import { DevicesRepository } from './devices.repository';
import { NotificationsService } from './notifications.service';
import { ExpoPushSender, LogPushSender, PUSH_SENDER } from './push-sender';

/** Devices (push tokens) and push notifications. Depends only on infrastructure. */
@Module({
  controllers: [DevicesController],
  providers: [
    DevicesRepository,
    NotificationsService,
    LogPushSender,
    ExpoPushSender,
    {
      provide: PUSH_SENDER,
      inject: [APP_CONFIG, LogPushSender, ExpoPushSender],
      useFactory: (config: AppConfig, log: LogPushSender, expo: ExpoPushSender) =>
        config.PUSH_PROVIDER === 'expo' ? expo : log,
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
