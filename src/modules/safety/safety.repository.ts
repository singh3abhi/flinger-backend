import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '@/infra/database/database.module';
import { blocks, reports, type ReportRow } from '@/infra/database/schema';

/** The only place that writes blocks and reports. */
@Injectable()
export class SafetyRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Returns true when the block is new. */
  async block(blockerId: string, blockedId: string): Promise<boolean> {
    const rows = await this.db
      .insert(blocks)
      .values({ blockerId, blockedId })
      .onConflictDoNothing()
      .returning({ blockedId: blocks.blockedId });
    return rows.length > 0;
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.db
      .delete(blocks)
      .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)));
  }

  listBlocked(blockerId: string) {
    return this.db
      .select({ userId: blocks.blockedId, createdAt: blocks.createdAt })
      .from(blocks)
      .where(eq(blocks.blockerId, blockerId))
      .orderBy(desc(blocks.createdAt));
  }

  async insertReport(
    report: Pick<
      ReportRow,
      'reporterId' | 'reportedId' | 'targetType' | 'targetId' | 'reason' | 'details' | 'snapshot'
    >,
  ): Promise<ReportRow> {
    const [row] = await this.db.insert(reports).values(report).returning();
    return row;
  }
}
