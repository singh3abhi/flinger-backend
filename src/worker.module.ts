import { Module } from '@nestjs/common';
import { AccountModule } from '@/modules/account';
import { CoreModule } from './core.module';
import { PurgeDeletedAccountsJob } from './worker/purge.job';

/** The background-job process (APP_MODE=worker). */
@Module({ imports: [CoreModule, AccountModule], providers: [PurgeDeletedAccountsJob] })
export class WorkerModule {}
