import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AccountService } from '@/modules/account';

const EVERY_MS = 60 * 60 * 1000;

/**
 * Erases accounts deleted more than 30 days ago, hourly. One worker instance is enough; running two
 * is harmless (each row is erased once). Moves to a BullMQ repeatable job with the queue (D-32).
 */
@Injectable()
export class PurgeDeletedAccountsJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PurgeDeletedAccountsJob.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly account: AccountService) {}

  onApplicationBootstrap(): void {
    void this.run();
    this.timer = setInterval(() => void this.run(), EVERY_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    try {
      while ((await this.account.purgeDeleted()) > 0) {
        // keep going until nothing is left
      }
    } catch (error) {
      this.logger.warn(`Purge failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
