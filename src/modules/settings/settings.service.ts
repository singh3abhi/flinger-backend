import { Injectable } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { SettingsRepository } from './settings.repository';

export const settingsSchema = z.object({
  /** Let people see when I've read their messages (and see theirs). Off by default. */
  readReceipts: z.boolean(),
  notifyNewMatches: z.boolean(),
  notifyNewMessages: z.boolean(),
});
export class SettingsDto extends createZodDto(settingsSchema) {}
export class UpdateSettingsDto extends createZodDto(settingsSchema.partial().strict()) {}
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  readReceipts: false,
  notifyNewMatches: true,
  notifyNewMessages: true,
};

/** Member settings. Missing row = defaults. */
@Injectable()
export class SettingsService {
  constructor(private readonly repo: SettingsRepository) {}

  async get(userId: string): Promise<Settings> {
    return (await this.getMany([userId])).get(userId) ?? DEFAULT_SETTINGS;
  }

  async getMany(userIds: readonly string[]): Promise<Map<string, Settings>> {
    const result = new Map<string, Settings>(userIds.map((id) => [id, { ...DEFAULT_SETTINGS }]));
    if (userIds.length === 0) return result;
    const rows = await this.repo.findMany(userIds);
    for (const r of rows) {
      result.set(r.userId, {
        readReceipts: r.readReceipts,
        notifyNewMatches: r.notifyNewMatches,
        notifyNewMessages: r.notifyNewMessages,
      });
    }
    return result;
  }

  async update(userId: string, changes: Partial<Settings>): Promise<Settings> {
    const next = { ...(await this.get(userId)), ...changes };
    await this.repo.save(userId, next);
    return next;
  }

  /** Both have read receipts on (the only case either sees the other's). */
  async bothShareReads(a: string, b: string): Promise<boolean> {
    const s = await this.getMany([a, b]);
    return Boolean(s.get(a)?.readReceipts && s.get(b)?.readReceipts);
  }

  delete(userId: string): Promise<void> {
    return this.repo.delete(userId);
  }
}
