import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';
import { Presence } from '@/infra/realtime/realtime.module';
import { REDIS } from '@/infra/redis/redis.module';
import { redisKey } from '@/infra/redis/redis-keys';
import { DevicesRepository } from './devices.repository';
import { PUSH_SENDER, type PushSender } from './push-sender';

export interface Notification {
  type: 'new_match' | 'new_message';
  title: string;
  body: string;
  /** Ids only; the app loads content when opened. */
  data: Record<string, string>;
  /**
   * Pushes with the same key go out at most once per COLLAPSE_SECONDS (e.g. one per conversation
   * while messages keep coming).
   */
  collapseKey?: string;
  /** Skip the push when the member has the app open (it gets the realtime event instead). */
  skipIfOnline?: boolean;
}

const COLLAPSE_SECONDS = 60;

/**
 * Push notifications. Best effort and never blocks the request that caused it: failures are
 * logged, not thrown. Moves to a queue worker with retries before launch (discussion log D-32).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly devices: DevicesRepository,
    private readonly presence: Presence,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Fire and forget. */
  notify(userId: string, notification: Notification): void {
    this.deliver(userId, notification).catch((error: unknown) =>
      this.logger.warn(`Push failed: ${error instanceof Error ? error.message : String(error)}`),
    );
  }

  /** Awaitable version (tests, workers). Returns how many pushes were sent. */
  async deliver(userId: string, n: Notification): Promise<number> {
    if (n.skipIfOnline && (await this.presence.isOnline(userId))) return 0;
    if (n.collapseKey) {
      const key = redisKey(this.config.APP_ENV, 'push', 'collapse', userId, n.collapseKey);
      if ((await this.redis.set(key, '1', 'EX', COLLAPSE_SECONDS, 'NX')) !== 'OK') return 0;
    }
    const tokens = await this.devices.tokensFor(userId);
    if (tokens.length === 0) return 0;
    const result = await this.sender.send(
      tokens.map((t) => ({
        token: t.pushToken,
        title: n.title,
        body: n.body,
        data: { ...n.data, type: n.type },
      })),
    );
    await this.devices.deleteTokens(result.invalidTokens);
    return tokens.length - result.invalidTokens.length;
  }
}
