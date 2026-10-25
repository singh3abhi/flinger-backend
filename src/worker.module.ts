import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';

/** The background-job process (APP_MODE=worker). Queue processors are added from phase P2. */
@Module({ imports: [CoreModule] })
export class WorkerModule {}
