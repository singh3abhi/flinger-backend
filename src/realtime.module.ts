import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth';
import { ChatModule } from '@/modules/chat';
import { HealthModule } from '@/modules/health/health.module';
import { CoreModule } from './core.module';
import { ChatGateway } from './realtime/chat.gateway';

/** The WebSocket process (APP_MODE=realtime): the chat gateway plus health checks. */
@Module({ imports: [CoreModule, HealthModule, AuthModule, ChatModule], providers: [ChatGateway] })
export class RealtimeModule {}
