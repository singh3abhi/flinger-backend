import { Module } from '@nestjs/common';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

/** Member settings. Read by notifications (opt-outs) and chat (read receipts). */
@Module({ providers: [SettingsRepository, SettingsService], exports: [SettingsService] })
export class SettingsModule {}
