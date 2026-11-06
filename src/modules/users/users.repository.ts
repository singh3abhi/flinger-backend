import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lt, ne } from 'drizzle-orm';
import { DRIZZLE, type Database, type Executor } from '@/infra/database/database.module';
import { users, type UserRow } from '@/infra/database/schema';

/** The only place that touches the `users` table. */
@Injectable()
export class UsersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async create(executor: Executor = this.db): Promise<UserRow> {
    const [row] = await executor.insert(users).values({}).returning();
    return row;
  }

  async findById(id: string, executor: Executor = this.db): Promise<UserRow | undefined> {
    const [row] = await executor.select().from(users).where(eq(users.id, id)).limit(1);
    return row;
  }

  async touchLastActive(id: string, executor: Executor = this.db): Promise<void> {
    await executor.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, id));
  }

  /** pending → active. A no-op for any other status (already active, paused, ...). */
  async activate(id: string, executor: Executor = this.db): Promise<void> {
    await executor
      .update(users)
      .set({ status: 'active', updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.status, 'pending')));
  }

  /** Change status only from `from` (so concurrent changes can't skip a state). True if changed. */
  async transition(
    id: string,
    from: UserRow['status'],
    to: UserRow['status'],
    executor: Executor = this.db,
  ): Promise<boolean> {
    const rows = await executor
      .update(users)
      .set({ status: to, updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.status, from)))
      .returning({ id: users.id });
    return rows.length > 0;
  }

  /** Soft delete: hidden everywhere at once; erased later by the purge job. */
  async markDeleted(id: string, executor: Executor = this.db): Promise<void> {
    await executor
      .update(users)
      .set({ status: 'deleted', deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(users.id, id), ne(users.status, 'deleted')));
  }

  async deletedBefore(cutoff: Date, limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.status, 'deleted'), lt(users.deletedAt, cutoff)))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  /** Erase the account row; everything that belongs to it goes with it (ON DELETE CASCADE). */
  async hardDelete(id: string): Promise<void> {
    await this.db.delete(users).where(and(eq(users.id, id), eq(users.status, 'deleted')));
  }
}
