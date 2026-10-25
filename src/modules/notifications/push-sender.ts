import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  /** Ids only (e.g. conversationId): the app loads the content when opened. */
  data: Record<string, string>;
}

export interface PushResult {
  /** Tokens the push service says are no longer valid; they are deleted. */
  invalidTokens: string[];
}

/** Delivers pushes. Behind an interface so the vendor can change (discussion log D-31). */
export interface PushSender {
  send(messages: PushMessage[]): Promise<PushResult>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');

/** Local development: records that pushes would be sent. Never logs tokens or text. */
@Injectable()
export class LogPushSender implements PushSender {
  private readonly logger = new Logger('Push');
  readonly sent: PushMessage[] = [];

  async send(messages: PushMessage[]): Promise<PushResult> {
    this.sent.push(...messages);
    for (const m of messages) this.logger.log(`push queued (${m.data.type ?? 'unknown'})`);
    return { invalidTokens: [] };
  }
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH = 100;

/** Expo Push Service: one API in front of APNs (iOS) and FCM (Android). */
@Injectable()
export class ExpoPushSender implements PushSender {
  private readonly logger = new Logger('Push');

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async send(messages: PushMessage[]): Promise<PushResult> {
    const invalidTokens: string[] = [];
    for (let i = 0; i < messages.length; i += EXPO_BATCH) {
      const batch = messages.slice(i, i + EXPO_BATCH);
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(this.config.EXPO_ACCESS_TOKEN
            ? { authorization: `Bearer ${this.config.EXPO_ACCESS_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(
          batch.map((m) => ({
            to: m.token,
            title: m.title,
            body: m.body,
            data: m.data,
            sound: 'default',
          })),
        ),
      });
      if (!response.ok) {
        this.logger.warn(`Expo push failed with HTTP ${response.status}`);
        continue;
      }
      const result = (await response.json()) as {
        data?: { status: string; details?: { error?: string } }[];
      };
      result.data?.forEach((ticket, index) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          invalidTokens.push(batch[index].token);
        }
      });
    }
    return { invalidTokens };
  }
}
