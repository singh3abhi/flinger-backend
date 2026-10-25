import type Redis from 'ioredis';
import { DomainError } from '@/common/errors/domain-error';
import type { AppConfig } from '@/config/config.module';
import type { MailMessage, MailProvider } from '@/infra/mail/mail.module';
import { RateLimiter } from '@/infra/redis/rate-limiter.service';
import { FakeRedis } from '../../../test/helpers/fake-redis';
import { TEST_CONFIG } from '../../../test/helpers/create-test-app';
import { OtpService } from './otp.service';

class FakeMail implements MailProvider {
  sent: MailMessage[] = [];
  fail = false;
  async send(message: MailMessage): Promise<void> {
    if (this.fail) throw new Error('smtp down');
    this.sent.push(message);
  }
  lastCode(): string {
    const match = /code is (\d{6})/.exec(this.sent.at(-1)?.text ?? '');
    if (!match) throw new Error('no code sent');
    return match[1];
  }
}

const EMAIL = 'rohan@example.com';
const IP = '10.0.0.1';

function setup(overrides: Partial<AppConfig> = {}) {
  const config: AppConfig = { ...TEST_CONFIG, ...overrides };
  const redis = new FakeRedis();
  const mail = new FakeMail();
  const rateLimiter = new RateLimiter(redis as unknown as Redis, config);
  const otp = new OtpService(redis as unknown as Redis, config, mail, rateLimiter);
  return { otp, redis, mail, config };
}

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error('expected the call to fail');
}

describe('OtpService', () => {
  it('emails a 6-digit code and reports resend/expiry timings', async () => {
    const { otp, mail } = setup();
    const result = await otp.request(EMAIL, IP);
    expect(result).toEqual({ resendAvailableInSeconds: 120, expiresInSeconds: 600 });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe(EMAIL);
    expect(mail.lastCode()).toMatch(/^\d{6}$/);
  });

  it('never stores the code or the email in Redis', async () => {
    const { otp, redis, mail } = setup();
    await otp.request(EMAIL, IP);
    const code = mail.lastCode();
    const stored = JSON.stringify(redis.dump());
    expect(stored).not.toContain(code);
    expect(stored).not.toContain(EMAIL);
  });

  it('accepts the right code once, then treats it as used', async () => {
    const { otp, mail } = setup();
    await otp.request(EMAIL, IP);
    const code = mail.lastCode();
    await expect(otp.verify(EMAIL, code, IP)).resolves.toBeUndefined();
    expect(await errorCode(otp.verify(EMAIL, code, IP))).toBe('OTP_EXPIRED');
  });

  it('rejects a wrong code', async () => {
    const { otp, mail } = setup();
    await otp.request(EMAIL, IP);
    const wrong = mail.lastCode() === '000000' ? '111111' : '000000';
    expect(await errorCode(otp.verify(EMAIL, wrong, IP))).toBe('OTP_INVALID');
  });

  it('destroys the code after too many wrong guesses, even if the next guess is right', async () => {
    const { otp, mail } = setup();
    await otp.request(EMAIL, IP);
    const code = mail.lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < TEST_CONFIG.OTP_MAX_ATTEMPTS; i += 1) {
      expect(await errorCode(otp.verify(EMAIL, wrong, IP))).toBe('OTP_INVALID');
    }
    expect(await errorCode(otp.verify(EMAIL, code, IP))).toBe('OTP_TOO_MANY_ATTEMPTS');
    expect(await errorCode(otp.verify(EMAIL, code, IP))).toBe('OTP_EXPIRED');
  });

  it('expires codes after the TTL', async () => {
    const { otp, mail, redis } = setup();
    await otp.request(EMAIL, IP);
    const code = mail.lastCode();
    redis.advance((TEST_CONFIG.OTP_TTL_SECONDS + 1) * 1000);
    expect(await errorCode(otp.verify(EMAIL, code, IP))).toBe('OTP_EXPIRED');
  });

  it('enforces the resend cooldown with Retry-After', async () => {
    const { otp, redis } = setup();
    await otp.request(EMAIL, IP);
    try {
      await otp.request(EMAIL, IP);
      throw new Error('expected cooldown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('OTP_COOLDOWN');
      expect(Number((error as DomainError).headers?.['Retry-After'])).toBeGreaterThan(0);
    }
    redis.advance(121_000);
    await expect(otp.request(EMAIL, IP)).resolves.toBeDefined();
  });

  it('a new code replaces the old one', async () => {
    const { otp, mail } = setup({ OTP_RESEND_COOLDOWN_SECONDS: 0 });
    await otp.request(EMAIL, IP);
    const first = mail.lastCode();
    await otp.request(EMAIL, IP);
    const second = mail.lastCode();
    if (first !== second) {
      expect(await errorCode(otp.verify(EMAIL, first, IP))).toBe('OTP_INVALID');
    }
    await expect(otp.verify(EMAIL, second, IP)).resolves.toBeUndefined();
  });

  it('limits code requests per email to 5 an hour', async () => {
    const { otp } = setup({ OTP_RESEND_COOLDOWN_SECONDS: 0 });
    for (let i = 0; i < 5; i += 1) await otp.request(EMAIL, `10.0.0.${i}`);
    expect(await errorCode(otp.request(EMAIL, '10.0.0.99'))).toBe('RATE_LIMITED');
  });

  it('limits code requests per IP to 20 an hour', async () => {
    const { otp } = setup({ OTP_RESEND_COOLDOWN_SECONDS: 0 });
    for (let i = 0; i < 20; i += 1) await otp.request(`person${i}@example.com`, IP);
    expect(await errorCode(otp.request('another@example.com', IP))).toBe('RATE_LIMITED');
  });

  it('lets the person retry immediately when the email cannot be sent', async () => {
    const { otp, mail } = setup();
    mail.fail = true;
    expect(await errorCode(otp.request(EMAIL, IP))).toBe('SERVICE_UNAVAILABLE');
    mail.fail = false;
    await expect(otp.request(EMAIL, IP)).resolves.toBeDefined();
  });

  it('test accounts get the fixed code and no email (outside production)', async () => {
    const { otp, mail } = setup({ OTP_TEST_EMAILS: ['qa@flinger.test'] });
    await otp.request('qa@flinger.test', IP);
    expect(mail.sent).toHaveLength(0);
    await expect(otp.verify('qa@flinger.test', '123456', IP)).resolves.toBeUndefined();
  });

  it('ignores the test-account list in production', async () => {
    const { otp, mail } = setup({ APP_ENV: 'production', OTP_TEST_EMAILS: ['qa@flinger.test'] });
    await otp.request('qa@flinger.test', IP);
    expect(mail.sent).toHaveLength(1);
  });
});
