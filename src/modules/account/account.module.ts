import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth';
import { MatchingModule } from '@/modules/matching';
import { NotificationsModule } from '@/modules/notifications';
import { PhotosModule } from '@/modules/photos';
import { SettingsModule } from '@/modules/settings';
import { UsersModule } from '@/modules/users';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { ExportRepository } from './export.repository';

/** The member's own account lifecycle: settings, pause, delete, export. */
@Module({
  imports: [
    UsersModule,
    SettingsModule,
    AuthModule,
    MatchingModule,
    NotificationsModule,
    PhotosModule,
  ],
  controllers: [AccountController],
  providers: [AccountService, ExportRepository],
  exports: [AccountService],
})
export class AccountModule {}
