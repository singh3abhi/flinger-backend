import request from 'supertest';
import { AuthService } from '@/modules/auth';
import { createIntegrationApp, type IntegrationContext } from './helpers/integration-app';

type Device = { id: string; platform: 'ios' | 'android' | 'web' };
const DEVICE: Device = { id: 'device-ios-0001', platform: 'ios' };

describe('Email sign-in (integration: real Postgres + Redis)', () => {
  let ctx: IntegrationContext;
  const http = () => request(ctx.app.getHttpServer());

  /** Request a code, read it from the captured email, verify it. */
  async function signIn(email: string, device: Device = DEVICE) {
    await http().post('/v1/auth/otp/request').send({ email }).expect(200);
    const code = ctx.mail.codeFor(email.trim().toLowerCase());
    const res = await http().post('/v1/auth/otp/verify').send({ email, code, device }).expect(200);
    return res.body as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      user: { id: string; status: string; isNewUser: boolean };
    };
  }

  beforeAll(async () => {
    ctx = await createIntegrationApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
  });

  it('first sign-in creates a pending account; GET /v1/me returns it', async () => {
    const session = await signIn('rohan@example.com');
    expect(session.user).toMatchObject({ status: 'pending', isNewUser: true });
    expect(session.expiresIn).toBe(900);

    const me = await http()
      .get('/v1/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({
      id: session.user.id,
      status: 'pending',
      email: 'rohan@example.com',
      onboardingCompleted: false,
    });
  });

  it('signing in again (any letter case or spacing) reaches the same account', async () => {
    const first = await signIn('rohan@example.com');
    const second = await signIn('  Rohan@Example.COM ');
    expect(second.user.id).toBe(first.user.id);
    expect(second.user.isNewUser).toBe(false);
    const users = await ctx.db.query('SELECT count(*)::int AS n FROM users');
    expect(users.rows[0].n).toBe(1);
  });

  it('stores only hashes of refresh tokens', async () => {
    const session = await signIn('rohan@example.com');
    const rows = await ctx.db.query('SELECT token_hash FROM refresh_tokens');
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].token_hash).not.toBe(session.refreshToken);
    expect(rows.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a wrong code fails with OTP_INVALID and field errors', async () => {
    await http().post('/v1/auth/otp/request').send({ email: 'rohan@example.com' }).expect(200);
    const code = ctx.mail.codeFor('rohan@example.com');
    const wrong = code === '000000' ? '111111' : '000000';
    const res = await http()
      .post('/v1/auth/otp/verify')
      .send({ email: 'rohan@example.com', code: wrong, device: DEVICE })
      .expect(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'OTP_INVALID', errors: [{ path: 'code' }] });
  });

  it('rejects malformed input with VALIDATION_FAILED', async () => {
    const res = await http()
      .post('/v1/auth/otp/verify')
      .send({ email: 'not-an-email', code: '12', device: { id: 'x', platform: 'symbian' } })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    const paths = (res.body.errors as Array<{ path: string }>).map((e) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining(['email', 'code', 'device.id', 'device.platform']),
    );
  });

  it('rate limits code requests per email (RATE_LIMITED with Retry-After)', async () => {
    for (let i = 0; i < 5; i += 1) {
      await http().post('/v1/auth/otp/request').send({ email: 'rohan@example.com' }).expect(200);
    }
    const res = await http()
      .post('/v1/auth/otp/request')
      .send({ email: 'rohan@example.com' })
      .expect(429);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  describe('sessions', () => {
    it('refresh rotates: the new pair works, the old refresh token does not', async () => {
      const session = await signIn('rohan@example.com');
      const rotated = await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(200);
      expect(rotated.body.refreshToken).not.toBe(session.refreshToken);
      await http()
        .get('/v1/me')
        .set('Authorization', `Bearer ${rotated.body.accessToken}`)
        .expect(200);
    });

    it('reusing an old refresh token revokes the whole session (theft protection)', async () => {
      const session = await signIn('rohan@example.com');
      const rotated = await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(200);
      // The legitimate app keeps going.
      const latest = await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: rotated.body.refreshToken })
        .expect(200);

      // Someone replays the stolen, long-used token:
      const replay = await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
      expect(replay.body.code).toBe('INVALID_REFRESH_TOKEN');

      // ...so the legitimate device's newest tokens are dead too.
      await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: latest.body.refreshToken })
        .expect(401);
      await http()
        .get('/v1/me')
        .set('Authorization', `Bearer ${latest.body.accessToken}`)
        .expect(401);
    });

    it('an app that lost the refresh response may retry once with the same token', async () => {
      const session = await signIn('rohan@example.com');
      const lost = await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(200);
      // The app was killed before saving `lost`, and retries with the token it still has.
      const retried = await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(200);
      await http()
        .get('/v1/me')
        .set('Authorization', `Bearer ${retried.body.accessToken}`)
        .expect(200);
      expect(retried.body.refreshToken).not.toBe(lost.body.refreshToken);
      // Still exactly one live refresh token for the device.
      const live = await ctx.db.query(
        'SELECT count(*)::int AS n FROM refresh_tokens WHERE revoked_at IS NULL AND replaced_by IS NULL',
      );
      expect(live.rows[0].n).toBe(1);
    });

    it('the grace period only covers a fresh rotation', async () => {
      const session = await signIn('rohan@example.com');
      await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(200);
      await ctx.db.query(
        "UPDATE refresh_tokens SET revoked_at = now() - interval '5 minutes' WHERE replaced_by IS NOT NULL",
      );
      await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
    });

    it('logout ends the session immediately, other devices stay signed in', async () => {
      const phone = await signIn('rohan@example.com', DEVICE);
      const tablet = await signIn('rohan@example.com', {
        id: 'device-android-0002',
        platform: 'android',
      });

      await http()
        .post('/v1/auth/logout')
        .set('Authorization', `Bearer ${phone.accessToken}`)
        .expect(204);

      await http().get('/v1/me').set('Authorization', `Bearer ${phone.accessToken}`).expect(401);
      await http().post('/v1/auth/refresh').send({ refreshToken: phone.refreshToken }).expect(401);
      await http().get('/v1/me').set('Authorization', `Bearer ${tablet.accessToken}`).expect(200);
    });

    it('protected routes need a valid token', async () => {
      const missing = await http().get('/v1/me').expect(401);
      expect(missing.body.code).toBe('UNAUTHORIZED');
      expect(missing.headers['www-authenticate']).toBe('Bearer');

      const session = await signIn('rohan@example.com');
      const tampered = `${session.accessToken.slice(0, -4)}AAAA`;
      await http().get('/v1/me').set('Authorization', `Bearer ${tampered}`).expect(401);
    });

    it('suspended accounts cannot sign in or use existing sessions', async () => {
      const session = await signIn('rohan@example.com');
      await ctx.db.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [session.user.id]);

      const me = await http()
        .get('/v1/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(403);
      expect(me.body.code).toBe('ACCOUNT_UNAVAILABLE');

      await http().post('/v1/auth/otp/request').send({ email: 'rohan@example.com' }).expect(200);
      const code = ctx.mail.codeFor('rohan@example.com');
      const verify = await http()
        .post('/v1/auth/otp/verify')
        .send({ email: 'rohan@example.com', code, device: DEVICE })
        .expect(403);
      expect(verify.body.code).toBe('ACCOUNT_UNAVAILABLE');
    });
  });

  it('two simultaneous first sign-ins for one email create exactly one account', async () => {
    const service = ctx.moduleRef.get(AuthService) as unknown as {
      findOrCreateAccount(email: string): Promise<{ userId: string; isNewUser: boolean }>;
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.findOrCreateAccount('race@example.com')),
    );
    expect(new Set(results.map((r) => r.userId)).size).toBe(1);
    expect(results.filter((r) => r.isNewUser)).toHaveLength(1);
    const users = await ctx.db.query('SELECT count(*)::int AS n FROM users');
    expect(users.rows[0].n).toBe(1);
  });
});
