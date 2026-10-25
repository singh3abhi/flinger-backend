import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth';
import { ClientConfigModule } from '@/modules/client-config/client-config.module';
import { HealthModule } from '@/modules/health/health.module';
import { MatchingModule } from '@/modules/matching';
import { PhotosModule } from '@/modules/photos';
import { ProfilesModule } from '@/modules/profiles';
import { CoreModule } from './core.module';

/** The REST API process (APP_MODE=api). Feature modules (auth, profiles, ...) are added here. */
@Module({
  imports: [
    CoreModule,
    HealthModule,
    ClientConfigModule,
    AuthModule,
    PhotosModule,
    ProfilesModule,
    MatchingModule,
  ],
})
export class ApiModule {}
