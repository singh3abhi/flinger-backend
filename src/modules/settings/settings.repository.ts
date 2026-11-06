import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type Database } from '@/infra/database/database.module';
import { userSettings, type UserSettingsRow } from '@/infra/database/schema';

/** The only place that touches `user_settings`. */
@Injectable()
export class SettingsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  findMany(userIds: readonly string[]): Promise<UserSettingsRow[]> {
    if (userIds.length === 0) return Promise.resolve([]);
    return this.db
      .select()
      .from(userSettings)
      .where(inArray(userSettings.userId, [...userIds]));
  }

  async save(
    userId: string,
    values: Pick<UserSettingsRow, 'readReceipts' | 'notifyNewMatches' | 'notifyNewMessages'>,
  ): Promise<void> {
    await this.db
      .insert(userSettings)
      .values({ userId, ...values })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { ...values, updatedAt: new Date() },
      });
  }

  async delete(userId: string): Promise<void> {
    await this.db.delete(userSettings).where(eq(userSettings.userId, userId));
  }
}
