import request from 'supertest';
import { createIntegrationApp, signInAs, type IntegrationContext } from './helpers/integration-app';

/** A GPS fix taken just now. */
const fix = (latitude: number, longitude: number, over: Record<string, unknown> = {}) => ({
  latitude,
  longitude,
  accuracyMeters: 25,
  mocked: false,
  capturedAt: new Date().toISOString(),
  ...over,
});

const INDIRANAGAR = [12.97194, 77.64116] as const; // Bengaluru
const BANDRA = [19.05444, 72.84056] as const; // Mumbai

describe('GPS location (integration: Postgres/PostGIS + Redis)', () => {
  let ctx: IntegrationContext;
  let token: string;
  const http = () => request(ctx.app.getHttpServer());
  const put = (body: object) =>
    http().put('/v1/me/location').set('Authorization', `Bearer ${token}`).send(body);

  beforeAll(async () => {
    ctx = await createIntegrationApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    token = await signInAs(ctx, 'diya@example.com');
  });

  it('labels the fix with the nearest city and stores it rounded to ~100 m', async () => {
    const res = await put(fix(...INDIRANAGAR)).expect(200);
    expect(res.body).toMatchObject({
      accepted: true,
      location: { city: 'Bengaluru', state: 'Karnataka' },
    });

    const stored = await ctx.db.query(
      'SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lon, location_accuracy_m FROM profiles',
    );
    expect(stored.rows[0]).toEqual({ lat: 12.972, lon: 77.641, location_accuracy_m: 25 });

    const profile = await http()
      .get('/v1/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(profile.body.location).toMatchObject({ city: 'Bengaluru' });
    expect(profile.body.onboarding.missing).not.toContain('location');
    // Coordinates are never sent back.
    expect(JSON.stringify(profile.body)).not.toContain('12.97');
  });

  it('refuses fake, foreign, inaccurate and old fixes with a reason', async () => {
    const cases: [object, string][] = [
      [fix(...INDIRANAGAR, { mocked: true }), 'LOCATION_MOCKED'],
      [fix(51.5072, -0.1276), 'LOCATION_OUTSIDE_SERVICE_AREA'],
      [fix(...INDIRANAGAR, { accuracyMeters: 50_000 }), 'LOCATION_TOO_INACCURATE'],
      [
        fix(...INDIRANAGAR, { capturedAt: new Date(Date.now() - 60 * 60_000).toISOString() }),
        'LOCATION_STALE',
      ],
    ];
    for (const [body, code] of cases) {
      const res = await put(body).expect(422);
      expect(res.body.code).toBe(code);
    }
    const rows = await ctx.db.query('SELECT location FROM profiles WHERE location IS NOT NULL');
    expect(rows.rowCount).toBe(0);
  });

  it('ignores impossible travel, keeps the old city and flags the account', async () => {
    await put(fix(...INDIRANAGAR)).expect(200);
    const jump = await put(fix(...BANDRA)).expect(200);
    expect(jump.body).toMatchObject({ accepted: false, location: { city: 'Bengaluru' } });
    const flagged = await ctx.db.query(
      'SELECT location_flagged_at IS NOT NULL AS flagged FROM profiles',
    );
    expect(flagged.rows[0].flagged).toBe(true);

    // After a real flight's worth of time the move is accepted.
    await ctx.db.query("UPDATE profiles SET location_updated_at = now() - interval '3 hours'");
    const later = await put(fix(...BANDRA)).expect(200);
    expect(later.body).toMatchObject({ accepted: true, location: { city: 'Mumbai' } });
  });

  it('gives no city label far from any known place, but still saves the location', async () => {
    // Thar desert, far from every seeded city.
    const res = await put(fix(27.0, 71.0)).expect(200);
    expect(res.body).toMatchObject({ accepted: true, location: { city: null, state: null } });
  });

  it('validates the body', async () => {
    await put({ latitude: 200, longitude: 77, accuracyMeters: 5, capturedAt: new Date() }).expect(
      400,
    );
    await put({ latitude: 12.9, longitude: 77.6, accuracyMeters: 5 }).expect(400);
  });
});
