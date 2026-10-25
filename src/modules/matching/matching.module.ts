import { Module } from '@nestjs/common';
import { NotificationsModule } from '@/modules/notifications';
import { PhotosModule } from '@/modules/photos';
import { ProfilesModule } from '@/modules/profiles';
import { UsersModule } from '@/modules/users';
import { LikesCounter } from './likes-counter';
import { MatchingController } from './matching.controller';
import { MatchingRepository } from './matching.repository';
import { MatchingService } from './matching.service';
import { SeenFilter } from './seen-filter';

/** Likes, passes, matches, the daily likes limit and the "seen" filter. */
@Module({
  imports: [UsersModule, ProfilesModule, PhotosModule, NotificationsModule],
  controllers: [MatchingController],
  providers: [MatchingRepository, MatchingService, LikesCounter, SeenFilter],
  exports: [MatchingService],
})
export class MatchingModule {}
