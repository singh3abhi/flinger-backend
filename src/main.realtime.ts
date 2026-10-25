import { bootstrapHttp, exitOnFailure } from './bootstrap/bootstrap-http';
import { RealtimeModule } from './realtime.module';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

bootstrapHttp(RealtimeModule, 'realtime', (app, config) => {
  app.useWebSocketAdapter(new RedisIoAdapter(app, config.REDIS_URL));
}).catch(exitOnFailure);
