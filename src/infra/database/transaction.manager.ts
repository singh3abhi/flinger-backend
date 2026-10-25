import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, type Database, type Tx } from './database.module';

/**
 * Explicit transactions. Services call `tx.run(async (t) => ...)` and pass `t` into repository
 * methods. There are no ambient transactions: if a method needs one it takes `Tx` as a parameter.
 */
@Injectable()
export class TransactionManager {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  run<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(work);
  }
}
