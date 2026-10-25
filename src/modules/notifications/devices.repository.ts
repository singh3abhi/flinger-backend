import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type Database } from '@/infra/database/database.module';
import { devices, type DeviceRow } from '@/infra/database/schema';

/** The only place that touches `devices`. */
@Injectable()
export class DevicesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Register (or move) a push token. A token belongs to one member and one install. */
  async saveToken(
    row: Pick<DeviceRow, 'userId' | 'deviceId' | 'platform' | 'pushProvider' | 'pushToken'>,
  ) {
    await this.db.transaction(async (tx) => {
      // The phone signed in as someone else, or the install changed: the token moves.
      await tx.delete(devices).where(eq(devices.pushToken, row.pushToken));
      await tx
        .insert(devices)
        .values(row)
        .onConflictDoUpdate({
          target: [devices.userId, devices.deviceId],
          set: {
            pushToken: row.pushToken,
            pushProvider: row.pushProvider,
            platform: row.platform,
            lastSeenAt: new Date(),
          },
        });
    });
  }

  async removeDevice(userId: string, deviceId: string): Promise<void> {
    await this.db
      .delete(devices)
      .where(and(eq(devices.userId, userId), eq(devices.deviceId, deviceId)));
  }

  tokensFor(userId: string): Promise<Pick<DeviceRow, 'pushToken' | 'pushProvider'>[]> {
    return this.db
      .select({ pushToken: devices.pushToken, pushProvider: devices.pushProvider })
      .from(devices)
      .where(eq(devices.userId, userId));
  }

  async deleteTokens(tokens: readonly string[]): Promise<void> {
    if (tokens.length === 0) return;
    await this.db.delete(devices).where(inArray(devices.pushToken, [...tokens]));
  }
}
