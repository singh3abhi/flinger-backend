import { Module } from '@nestjs/common';
import { ClientConfigModule } from '@/modules/client-config/client-config.module';
import { HealthModule } from '@/modules/health/health.module';
import { CoreModule } from './core.module';

/** The REST API process (APP_MODE=api). Feature modules (auth, profiles, ...) are added here. */
@Module({ imports: [CoreModule, HealthModule, ClientConfigModule] })
export class ApiModule {}
