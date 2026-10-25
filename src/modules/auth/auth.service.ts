import { Injectable } from '@nestjs/common';
import type { AuthUser } from '@/common/decorators/current-user.decorator';
import { DomainError } from '@/common/errors/domain-error';
import { ErrorCode } from '@/common/errors/error-codes';
import { TransactionManager } from '@/infra/database/transaction.manager';
import { UsersService } from '@/modules/users';
import { AuthRepository } from './auth.repository';
import { OtpService, type OtpRequestResult } from './otp.service';
import { TokenService, type Device, type Tokens } from './token.service';

export interface AuthResult extends Tokens {
  user: { id: string; status: AuthUser['status']; isNewUser: boolean };
}

const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  // Drizzle wraps driver errors; the Postgres code is on the error or its cause.
  const candidates = [error, (error as { cause?: unknown } | undefined)?.cause];
  return candidates.some((e) => (e as { code?: string } | undefined)?.code === PG_UNIQUE_VIOLATION);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly repository: AuthRepository,
    private readonly users: UsersService,
    private readonly transactions: TransactionManager,
  ) {}

  requestOtp(email: string, ip: string): Promise<OtpRequestResult> {
    return this.otp.request(email, ip);
  }

  /**
   * Check the code, then sign in. The first successful code for an email creates the account
   * (one account per email), so sign-up and sign-in are the same step.
   */
  async verifyOtp(
    input: { email: string; code: string; device: Device },
    ip: string,
  ): Promise<AuthResult> {
    await this.otp.verify(input.email, input.code, ip);

    const { userId, isNewUser } = await this.findOrCreateAccount(input.email);
    const user = await this.users.findById(userId);
    if (!user) {
      throw new DomainError(ErrorCode.INTERNAL_ERROR, 'Account missing after sign-in', {
        status: 500,
      });
    }
    this.users.assertAccountAvailable(user);

    const tokens = await this.tokens.issueSession(userId, input.device);
    await this.users.touchLastActive(userId);
    return { ...tokens, user: { id: userId, status: user.status, isNewUser } };
  }

  refresh(refreshToken: string): Promise<Tokens> {
    return this.tokens.rotate(refreshToken);
  }

  /** Sign out this device. The access token stops working immediately (the guard checks the session). */
  logout(sessionId: string): Promise<void> {
    return this.tokens.revokeSession(sessionId);
  }

  /** Called by the guard on every authenticated request. Undefined means the session is gone. */
  async validateSession(userId: string, sessionId: string): Promise<AuthUser | undefined> {
    const row = await this.repository.findUserForActiveSession(userId, sessionId);
    if (!row) return undefined;
    this.users.assertAccountAvailable(row);
    return { id: row.id, sessionId, status: row.status };
  }

  /**
   * The member behind an access token whose session is still live (for WebSocket handshakes, which
   * don't pass through the HTTP guard).
   */
  async authenticateAccessToken(token: string): Promise<AuthUser | undefined> {
    const claims = await this.tokens.verifyAccess(token);
    if (!claims) return undefined;
    try {
      return await this.validateSession(claims.sub, claims.sid);
    } catch {
      return undefined; // suspended or deleted
    }
  }

  findEmail(userId: string): Promise<string | undefined> {
    return this.repository.findSubjectForUser(userId, 'email');
  }

  private async findOrCreateAccount(
    email: string,
  ): Promise<{ userId: string; isNewUser: boolean }> {
    const existing = await this.repository.findIdentity('email', email);
    if (existing) {
      await this.repository.markIdentityVerified(existing.id);
      return { userId: existing.userId, isNewUser: false };
    }
    try {
      const userId = await this.transactions.run(async (tx) => {
        const user = await this.users.createPending(tx);
        await this.repository.insertIdentity(
          { userId: user.id, provider: 'email', subject: email, verifiedAt: new Date() },
          tx,
        );
        return user.id;
      });
      return { userId, isNewUser: true };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Two sign-ins for the same new email raced; the other one won. Use its account.
      const winner = await this.repository.findIdentity('email', email);
      if (!winner) throw error;
      return { userId: winner.userId, isNewUser: false };
    }
  }
}
