import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
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
}
