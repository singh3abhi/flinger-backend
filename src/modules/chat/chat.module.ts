import { Module } from '@nestjs/common';
import { MatchingModule } from '@/modules/matching';
import { NotificationsModule } from '@/modules/notifications';
import { ProfilesModule } from '@/modules/profiles';
import { ChatController } from './chat.controller';
import { ChatRepository } from './chat.repository';
import { ChatService } from './chat.service';

/** Conversations and messages (REST). The Socket.IO gateway lives in the realtime process. */
@Module({
  imports: [MatchingModule, ProfilesModule, NotificationsModule],
  controllers: [ChatController],
  providers: [ChatRepository, ChatService],
  exports: [ChatService],
})
export class ChatModule {}
