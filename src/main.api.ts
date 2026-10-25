import { ApiModule } from './api.module';
import { bootstrapHttp, exitOnFailure } from './bootstrap/bootstrap-http';

bootstrapHttp(ApiModule, 'api').catch(exitOnFailure);
