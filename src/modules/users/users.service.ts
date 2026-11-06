import { Injectable } from '@nestjs/common';
import { DomainError } from '@/common/errors/domain-error';
import { ErrorCode } from '@/common/errors/error-codes';
import type { Executor } from '@/infra/database/database.module';
import type { UserRow } from '@/infra/database/schema';
import { UsersRepository } from './users.repository';

/** Public API of the users module: other modules call this, never the repository. */
@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  /** A brand-new account in the `pending` state (onboarding not finished). */
  createPending(executor?: Executor): Promise<UserRow> {
    return this.users.create(executor);
  }

  findById(id: string): Promise<UserRow | undefined> {
    return this.users.findById(id);
  }

  /** Suspended and deleted accounts cannot sign in or call the API. */
  assertAccountAvailable(user: Pick<UserRow, 'status'>): void {
    if (user.status === 'suspended' || user.status === 'deleted') {
      throw new DomainError(
        ErrorCode.ACCOUNT_UNAVAILABLE,
        'This account is not available. Please contact support.',
        { status: 403 },
      );
    }
  }

  /** Onboarding finished: the account becomes active (visible once discovery exists). */
  activate(id: string, executor?: Executor): Promise<void> {
    return this.users.activate(id, executor);
  }

  /** Hide the profile (active → paused). Chats stay. */
  pause(id: string): Promise<boolean> {
    return this.users.transition(id, 'active', 'paused');
  }

  unpause(id: string): Promise<boolean> {
    return this.users.transition(id, 'paused', 'active');
  }

  markDeleted(id: string, executor?: Executor): Promise<void> {
    return this.users.markDeleted(id, executor);
  }

  deletedBefore(cutoff: Date, limit: number): Promise<string[]> {
    return this.users.deletedBefore(cutoff, limit);
  }

  hardDelete(id: string): Promise<void> {
    return this.users.hardDelete(id);
  }

  touchLastActive(id: string): Promise<void> {
    return this.users.touchLastActive(id);
  }
}
