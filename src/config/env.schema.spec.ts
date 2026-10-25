import { parseEnv } from './env.schema';

const valid = {
  DATABASE_URL: 'postgres://flinger:flinger@localhost:5432/flinger',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  OTP_PEPPER: 'p'.repeat(16),
};

describe('parseEnv', () => {
  it('applies defaults for optional variables', () => {
    const env = parseEnv(valid);
    expect(env).toMatchObject({
      APP_ENV: 'local',
      NODE_ENV: 'development',
      APP_MODE: 'api',
      PORT: 4000,
      LOG_LEVEL: 'info',
      MIN_APP_VERSION: '1.0.0',
      CORS_ORIGINS: [],
    });
  });

  it('coerces PORT and splits CORS_ORIGINS', () => {
    const env = parseEnv({
      ...valid,
      PORT: '8080',
      CORS_ORIGINS: ' https://a.test , https://b.test,, ',
    });
    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
  });

  it('accepts postgresql:// and rediss:// URLs', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://u:p@db.example:5432/x',
        REDIS_URL: 'rediss://cache.example:6380',
        JWT_ACCESS_SECRET: 'x'.repeat(32),
        OTP_PEPPER: 'p'.repeat(16),
      }),
    ).not.toThrow();
  });

  it('lists every problem in one error, so a bad deploy is diagnosable at once', () => {
    expect(() => parseEnv({ PORT: '99999', APP_ENV: 'staging', MIN_APP_VERSION: 'one' })).toThrow(
      /DATABASE_URL[\s\S]*REDIS_URL|REDIS_URL[\s\S]*DATABASE_URL/,
    );
    try {
      parseEnv({ PORT: '99999', APP_ENV: 'staging', MIN_APP_VERSION: 'one' });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('Invalid environment configuration');
      for (const key of ['PORT', 'APP_ENV', 'MIN_APP_VERSION', 'DATABASE_URL', 'REDIS_URL']) {
        expect(message).toContain(key);
      }
    }
  });

  it('rejects weak secrets', () => {
    expect(() => parseEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => parseEnv({ ...valid, OTP_PEPPER: 'short' })).toThrow(/OTP_PEPPER/);
  });

  it('refuses test OTP accounts in production', () => {
    expect(() =>
      parseEnv({ ...valid, APP_ENV: 'production', OTP_TEST_EMAILS: 'qa@flinger.app' }),
    ).toThrow(/OTP_TEST_EMAILS/);
    expect(
      parseEnv({ ...valid, APP_ENV: 'uat', OTP_TEST_EMAILS: 'qa@flinger.app' }).OTP_TEST_EMAILS,
    ).toEqual(['qa@flinger.app']);
  });

  it('rejects a non-postgres database URL', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'mysql://u:p@localhost/x' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('never echoes secret values in the error text', () => {
    try {
      parseEnv({ ...valid, DATABASE_URL: 'mysql://admin:hunter2@localhost/x' });
      throw new Error('expected parseEnv to throw');
    } catch (error) {
      expect((error as Error).message).not.toContain('hunter2');
    }
  });
});
