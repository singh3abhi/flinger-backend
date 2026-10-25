import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { DomainError } from '@/common/errors/domain-error';
import { ErrorCode } from '@/common/errors/error-codes';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';
import { MAIL_PROVIDER, type MailProvider } from '@/infra/mail/mail.module';
import { RateLimiter } from '@/infra/redis/rate-limiter.service';
import { redisKey } from '@/infra/redis/redis-keys';
import { REDIS } from '@/infra/redis/redis.module';

const HOUR = 3600;

export interface OtpRequestResult {
  resendAvailableInSeconds: number;
  expiresInSeconds: number;
}

/**
 * Six-digit sign-in codes.
 *
 * - The code is never stored: only HMAC(code) keyed with a server secret, in Redis with a TTL.
 * - Wrong guesses are capped per code (OTP_MAX_ATTEMPTS), after which the code is destroyed.
 * - Requests are rate limited per email and per IP; resends have a cooldown.
 * - Codes and emails are never logged. Redis keys use a hash of the email, not the email.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
    private readonly rateLimiter: RateLimiter,
  ) {}

  async request(email: string, ip: string): Promise<OtpRequestResult> {
    const id = this.identityHash(email);

    await this.enforceRateLimit('otp-req-ip', ip, 20, HOUR);
    await this.enforceRateLimit('otp-req-id', id, 5, HOUR);

    const cooldownKey = this.key('otp', 'cooldown', id);
    const cooldownLeft = await this.redis.ttl(cooldownKey);
    if (cooldownLeft > 0) {
      throw new DomainError(
        ErrorCode.OTP_COOLDOWN,
        `Please wait ${cooldownLeft} seconds before asking for a new code.`,
        { status: 429, headers: { 'Retry-After': String(cooldownLeft) } },
      );
    }

    const isTestAccount = this.isTestAccount(email);
    const code = isTestAccount
      ? this.config.OTP_TEST_CODE
      : randomInt(0, 1_000_000).toString().padStart(6, '0');

    const write = this.redis
      .multi()
      .set(this.key('otp', 'code', id), this.digest(id, code), 'EX', this.config.OTP_TTL_SECONDS)
      .del(this.key('otp', 'attempts', id));
    if (this.config.OTP_RESEND_COOLDOWN_SECONDS > 0) {
      write.set(cooldownKey, '1', 'EX', this.config.OTP_RESEND_COOLDOWN_SECONDS);
    }
    await write.exec();

    if (!isTestAccount) {
      try {
        await this.mail.send({
          to: email,
          subject: 'Your Flinger sign-in code',
          text:
            `Your Flinger code is ${code}.\n\n` +
            `It expires in ${Math.round(this.config.OTP_TTL_SECONDS / 60)} minutes. ` +
            `If you did not ask for it, you can ignore this email.`,
          html:
            `<p>Your Flinger code is <strong style="font-size:20px;letter-spacing:2px">${code}</strong>.</p>` +
            `<p>It expires in ${Math.round(this.config.OTP_TTL_SECONDS / 60)} minutes. ` +
            `If you did not ask for it, you can ignore this email.</p>`,
        });
      } catch (error) {
        // Let the person try again straight away instead of waiting out the cooldown.
        await this.redis.del(this.key('otp', 'code', id), cooldownKey);
        this.logger.error({ err: error }, 'Failed to send sign-in email');
        throw new DomainError(
          ErrorCode.SERVICE_UNAVAILABLE,
          'We could not send the email. Please try again in a moment.',
          { status: 503 },
        );
      }
    }

    return {
      resendAvailableInSeconds: this.config.OTP_RESEND_COOLDOWN_SECONDS,
      expiresInSeconds: this.config.OTP_TTL_SECONDS,
    };
  }

  /** Throws unless `code` is the live code for `email`. A correct code is consumed. */
  async verify(email: string, code: string, ip: string): Promise<void> {
    const id = this.identityHash(email);
    await this.enforceRateLimit('otp-verify-ip', ip, 60, 15 * 60);

    const codeKey = this.key('otp', 'code', id);
    const stored = await this.redis.get(codeKey);
    if (!stored) {
      throw new DomainError(
        ErrorCode.OTP_EXPIRED,
        'That code has expired. Please request a new one.',
        { status: 400 },
      );
    }

    const attemptsKey = this.key('otp', 'attempts', id);
    const attempts = await this.redis.incr(attemptsKey);
    if (attempts === 1) await this.redis.expire(attemptsKey, this.config.OTP_TTL_SECONDS);
    if (attempts > this.config.OTP_MAX_ATTEMPTS) {
      await this.redis.del(codeKey, attemptsKey);
      throw new DomainError(
        ErrorCode.OTP_TOO_MANY_ATTEMPTS,
        'Too many wrong codes. Please request a new one.',
        { status: 429 },
      );
    }

    const expected = Buffer.from(stored, 'hex');
    const given = Buffer.from(this.digest(id, code), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new DomainError(ErrorCode.OTP_INVALID, 'That code is not right. Please try again.', {
        status: 400,
        errors: [{ path: 'code', message: 'Incorrect code' }],
      });
    }

    await this.redis.del(codeKey, attemptsKey, this.key('otp', 'cooldown', id));
  }

  private isTestAccount(email: string): boolean {
    return this.config.APP_ENV !== 'production' && this.config.OTP_TEST_EMAILS.includes(email);
  }

  private async enforceRateLimit(scope: string, id: string, limit: number, windowSeconds: number) {
    const result = await this.rateLimiter.hit(scope, id, limit, windowSeconds);
    if (!result.allowed) {
      throw new DomainError(ErrorCode.RATE_LIMITED, 'Too many attempts. Please try again later.', {
        status: 429,
        headers: { 'Retry-After': String(result.retryAfterSeconds) },
      });
    }
  }

  private key(...parts: string[]): string {
    return redisKey(this.config.APP_ENV, ...parts);
  }

  /** Stable, non-reversible id for an email, used in Redis keys so no address is stored there. */
  private identityHash(email: string): string {
    return createHash('sha256')
      .update(`${this.config.OTP_PEPPER}:${email}`)
      .digest('hex')
      .slice(0, 32);
  }

  private digest(identityHash: string, code: string): string {
    return createHmac('sha256', this.config.OTP_PEPPER)
      .update(`${identityHash}:${code}`)
      .digest('hex');
  }
}
