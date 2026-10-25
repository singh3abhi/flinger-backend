import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { DRIZZLE, type Database, type Executor } from '@/infra/database/database.module';
import {
  authIdentities,
  refreshTokens,
  users,
  type AuthIdentityRow,
  type RefreshTokenRow,
  type UserRow,
} from '@/infra/database/schema';

type Provider = AuthIdentityRow['provider'];

/** The only place that touches `auth_identities` and `refresh_tokens`. */
@Injectable()
export class AuthRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findIdentity(
    provider: Provider,
    subject: string,
    executor: Executor = this.db,
  ): Promise<AuthIdentityRow | undefined> {
    const [row] = await executor
      .select()
      .from(authIdentities)
      .where(and(eq(authIdentities.provider, provider), eq(authIdentities.subject, subject)))
      .limit(1);
    return row;
  }

  /** Throws a unique-violation (23505) if the identity already belongs to someone. */
  async insertIdentity(
    values: { userId: string; provider: Provider; subject: string; verifiedAt?: Date },
    executor: Executor = this.db,
  ): Promise<AuthIdentityRow> {
    const [row] = await executor.insert(authIdentities).values(values).returning();
    return row;
  }

  async markIdentityVerified(id: string, executor: Executor = this.db): Promise<void> {
    await executor
      .update(authIdentities)
      .set({ verifiedAt: new Date() })
      .where(and(eq(authIdentities.id, id), isNull(authIdentities.verifiedAt)));
  }

  async findSubjectForUser(
    userId: string,
    provider: Provider,
    executor: Executor = this.db,
  ): Promise<string | undefined> {
    const [row] = await executor
      .select({ subject: authIdentities.subject })
      .from(authIdentities)
      .where(and(eq(authIdentities.userId, userId), eq(authIdentities.provider, provider)))
      .limit(1);
    return row?.subject;
  }

  async insertRefreshToken(
    values: {
      id: string;
      userId: string;
      familyId: string;
      tokenHash: string;
      deviceId: string | null;
      platform: string | null;
      expiresAt: Date;
    },
    executor: Executor = this.db,
  ): Promise<RefreshTokenRow> {
    const [row] = await executor.insert(refreshTokens).values(values).returning();
    return row;
  }

  /** Locks the row so two concurrent refreshes of the same token cannot both succeed. */
  async findRefreshTokenForUpdate(
    tokenHash: string,
    executor: Executor,
  ): Promise<RefreshTokenRow | undefined> {
    const [row] = await executor
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1)
      .for('update');
    return row;
  }

  async findRefreshTokenByIdForUpdate(
    id: string,
    executor: Executor,
  ): Promise<RefreshTokenRow | undefined> {
    const [row] = await executor
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, id))
      .limit(1)
      .for('update');
    return row;
  }

  async markRotated(id: string, replacedBy: string, executor: Executor): Promise<void> {
    await executor
      .update(refreshTokens)
      .set({ replacedBy, revokedAt: new Date() })
      .where(eq(refreshTokens.id, id));
  }

  /** Revoke every token of a device session. */
  async revokeFamily(familyId: string, executor: Executor = this.db): Promise<void> {
    await executor
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  /** The account behind a live (not revoked, not expired) device session, or undefined. */
  async findUserForActiveSession(
    userId: string,
    familyId: string,
    executor: Executor = this.db,
  ): Promise<Pick<UserRow, 'id' | 'status'> | undefined> {
    const [row] = await executor
      .select({ id: users.id, status: users.status })
      .from(refreshTokens)
      .innerJoin(users, eq(users.id, refreshTokens.userId))
      .where(
        and(
          eq(refreshTokens.userId, userId),
          eq(refreshTokens.familyId, familyId),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return row;
  }
}
