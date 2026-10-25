import { Module } from '@nestjs/common';
import { PhotosModule } from '@/modules/photos';
import { MyProfileController, PromptsController } from './profiles.controller';
import { ProfilesRepository } from './profiles.repository';
import { ProfilesService } from './profiles.service';

/** Onboarding answers, prompts and consents. Photos come from the photos module; location joins in slice 2d. */
@Module({
  imports: [PhotosModule],
  controllers: [MyProfileController, PromptsController],
  providers: [ProfilesRepository, ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
