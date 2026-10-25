import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DomainError } from '@/common/errors/domain-error';
import { ErrorCode } from '@/common/errors/error-codes';
import { uuidv7 } from '@/common/utils/uuid';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';
import { TransactionManager } from '@/infra/database/transaction.manager';
import { UsersService } from '@/modules/users';
import { AuthRepository } from './auth.repository';

export interface Device {
  id: string;
  platform: 'ios' | 'android' | 'web';
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface AccessClaims {
  /** user id */
  sub: string;
  /** session (refresh-token family) id */
  sid: string;
}

const invalidRefresh = () =>
  new DomainError(
    ErrorCode.INVALID_REFRESH_TOKEN,
    'Your session has ended. Please sign in again.',
    {
      status: 401,
    },
  );

/**
 * Access tokens are short-lived JWTs (default 15 minutes). Refresh tokens are opaque random
 * strings stored hashed and rotated on every use. Presenting a token that was already rotated
 * means it leaked, so the whole device session is revoked.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly repository: AuthRepository,
    private readonly users: UsersService,
    private readonly transactions: TransactionManager,
  ) {}

  /** A brand-new device session. */
  async issueSession(userId: string, device: Device): Promise<Tokens> {
    const familyId = uuidv7();
    const raw = this.newRawToken();
    await this.repository.insertRefreshToken({
      id: uuidv7(),
      userId,
      familyId,
      tokenHash: this.hash(raw),
      deviceId: device.id,
      platform: device.platform,
      expiresAt: this.refreshExpiry(),
    });
    return this.tokens(userId, familyId, raw);
  }

  /** Exchange a refresh token for a new pair; the old one stops working. */
  async rotate(rawToken: string): Promise<Tokens> {
    const outcome = await this.transactions.run(async (tx) => {
      const row = await this.repository.findRefreshTokenForUpdate(this.hash(rawToken), tx);
      if (!row) return { kind: 'invalid' as const };

      if (row.revokedAt || row.replacedBy) {
        // A token that was already used or revoked came back: treat the session as stolen.
        await this.repository.revokeFamily(row.familyId, tx);
        return { kind: 'reuse' as const, familyId: row.familyId };
      }
      if (row.expiresAt.getTime() <= Date.now()) return { kind: 'invalid' as const };

      const next = this.newRawToken();
      const nextId = uuidv7();
      await this.repository.insertRefreshToken(
        {
          id: nextId,
          userId: row.userId,
          familyId: row.familyId,
          tokenHash: this.hash(next),
          deviceId: row.deviceId,
          platform: row.platform,
          expiresAt: this.refreshExpiry(),
        },
        tx,
      );
      await this.repository.markRotated(row.id, nextId, tx);
      return { kind: 'ok' as const, userId: row.userId, familyId: row.familyId, raw: next };
    });

    if (outcome.kind === 'reuse') {
      this.logger.warn(
        { sessionId: outcome.familyId },
        'Refresh token reuse detected; session revoked',
      );
    }
    if (outcome.kind !== 'ok') throw invalidRefresh();

    const user = await this.users.findById(outcome.userId);
    if (!user) throw invalidRefresh();
    this.users.assertAccountAvailable(user);
    return this.tokens(outcome.userId, outcome.familyId, outcome.raw);
  }

  revokeSession(familyId: string): Promise<void> {
    return this.repository.revokeFamily(familyId);
  }

  private async tokens(userId: string, familyId: string, rawRefresh: string): Promise<Tokens> {
    const claims: AccessClaims = { sub: userId, sid: familyId };
    const accessToken = await this.jwt.signAsync(claims, {
      expiresIn: this.config.ACCESS_TOKEN_TTL_SECONDS,
    });
    return {
      accessToken,
      refreshToken: rawRefresh,
      tokenType: 'Bearer',
      expiresIn: this.config.ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  private newRawToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  }
}
