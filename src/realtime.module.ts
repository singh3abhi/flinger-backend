import { Module } from '@nestjs/common';
import { HealthModule } from '@/modules/health/health.module';
import { CoreModule } from './core.module';

/** The WebSocket process (APP_MODE=realtime). The chat gateway is added in phase P6. */
@Module({ imports: [CoreModule, HealthModule] })
export class RealtimeModule {}
