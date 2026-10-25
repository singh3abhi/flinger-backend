import { Module } from '@nestjs/common';
import { MyProfileController, PromptsController } from './profiles.controller';
import { ProfilesRepository } from './profiles.repository';
import { ProfilesService } from './profiles.service';

/** Onboarding answers, prompts and consents. Photos and location join in later F2 slices. */
@Module({
  controllers: [MyProfileController, PromptsController],
  providers: [ProfilesRepository, ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
