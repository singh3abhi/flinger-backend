import { Module } from '@nestjs/common';
import { ChatModule } from '@/modules/chat';
import { MatchingModule } from '@/modules/matching';
import { PhotosModule } from '@/modules/photos';
import { ProfilesModule } from '@/modules/profiles';
import { UsersModule } from '@/modules/users';
import { SafetyController } from './safety.controller';
import { SafetyRepository } from './safety.repository';
import { SafetyService } from './safety.service';

/** Blocks and reports. Other modules read `blocks` (read-only) to hide blocked people. */
@Module({
  imports: [UsersModule, MatchingModule, ProfilesModule, PhotosModule, ChatModule],
  controllers: [SafetyController],
  providers: [SafetyRepository, SafetyService],
  exports: [SafetyService],
})
export class SafetyModule {}
