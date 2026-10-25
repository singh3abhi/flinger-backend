import { bootstrapHttp, exitOnFailure } from './bootstrap/bootstrap-http';
import { RealtimeModule } from './realtime.module';

bootstrapHttp(RealtimeModule, 'realtime').catch(exitOnFailure);
