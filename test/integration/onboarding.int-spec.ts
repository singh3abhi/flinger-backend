import request from 'supertest';
import { LEGAL_VERSION } from '@/common/limits';
import { todayInIndia } from '@/modules/profiles/age';
import { createIntegrationApp, signInAs, type IntegrationContext } from './helpers/integration-app';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(1024, 1)]);

function birthDateForAge(years: number): string {
  const [y, m, d] = todayInIndia().split('-').map(Number);
  return new Date(Date.UTC(y - years, m - 1, d)).toISOString().slice(0, 10);
}

describe('Finishing onboarding (integration)', () => {
  let ctx: IntegrationContext;
  let token: string;
  const http = () => request(ctx.app.getHttpServer());
  const as = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

  async function addPhoto() {
    const res = await as(http().post('/v1/me/photos'))
      .send({ contentType: 'image/jpeg', byteSize: JPEG.length })
      .expect(201);
    const { photo, upload } = res.body;
    await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: JPEG });
    await as(http().post(`/v1/me/photos/${photo.id}/complete`))
      .send({ width: 1080, height: 1350 })
      .expect(200);
  }

  async function answerEverything() {
    await as(http().patch('/v1/me/profile'))
      .send({
        displayName: 'Ira',
        birthDate: birthDateForAge(27),
        gender: 'woman',
        interestedIn: ['men'],
        hopingToFind: ['long_term_relationship'],
        heightCm: 165,
        values: ['kindness'],
      })
      .expect(200);
    const library = await as(http().get('/v1/prompts')).expect(200);
    await as(http().put('/v1/me/prompts'))
      .send({
        prompts: library.body.items
          .slice(0, 3)
          .map((p: { id: string }) => ({ promptId: p.id, answer: 'Yes.' })),
      })
      .expect(200);
    for (let i = 0; i < 4; i += 1) await addPhoto();
    await as(http().put('/v1/me/location'))
      .send({
        latitude: 12.9719,
        longitude: 77.6412,
        accuracyMeters: 20,
        mocked: false,
        capturedAt: new Date().toISOString(),
      })
      .expect(200);
    await as(http().post('/v1/me/consents'))
      .send({ documents: ['terms', 'privacy', 'guidelines'], version: LEGAL_VERSION })
      .expect(204);
  }

  beforeAll(async () => {
    ctx = await createIntegrationApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    token = await signInAs(ctx, 'ira@example.com');
  });

  it('refuses to finish while steps are missing, and lists them', async () => {
    const res = await as(http().post('/v1/me/profile/complete')).expect(409);
    expect(res.body.code).toBe('ONBOARDING_INCOMPLETE');
    expect(res.body.errors.map((e: { path: string }) => e.path)).toEqual([
      'basics',
      'gender',
      'interested_in',
      'hoping_to_find',
      'height',
      'values',
      'photos',
      'prompts',
      'location',
      'consents',
    ]);
  });

  it('activates the account with default preferences once everything is done', async () => {
    await answerEverything();
    let me = await as(http().get('/v1/me')).expect(200);
    expect(me.body).toMatchObject({ status: 'pending', onboardingCompleted: false });

    const done = await as(http().post('/v1/me/profile/complete')).expect(200);
    expect(done.body.onboarding).toEqual({ completed: true, nextStep: null, missing: [] });

    me = await as(http().get('/v1/me')).expect(200);
    expect(me.body).toMatchObject({ status: 'active', onboardingCompleted: true });

    const prefs = await as(http().get('/v1/me/preferences')).expect(200);
    expect(prefs.body).toEqual({
      minAge: 22,
      maxAge: 32,
      maxDistanceKm: 50,
      showDistance: true,
      expandRadiusWhenEmpty: true,
    });

    // Finishing again is harmless.
    await as(http().post('/v1/me/profile/complete')).expect(200);
    const rows = await ctx.db.query('SELECT count(*)::int AS n FROM preferences');
    expect(rows.rows[0].n).toBe(1);
  });

  it('updates preferences partially and keeps the age range valid', async () => {
    await answerEverything();
    await as(http().post('/v1/me/profile/complete')).expect(200);

    const res = await as(http().patch('/v1/me/preferences'))
      .send({ maxDistanceKm: 120, showDistance: false })
      .expect(200);
    expect(res.body).toMatchObject({
      minAge: 22,
      maxAge: 32,
      maxDistanceKm: 120,
      showDistance: false,
    });

    // Below the stored minimum.
    const bad = await as(http().patch('/v1/me/preferences')).send({ maxAge: 20 }).expect(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');
    await as(http().patch('/v1/me/preferences')).send({ minAge: 40, maxAge: 30 }).expect(400);
    await as(http().patch('/v1/me/preferences')).send({ maxDistanceKm: 500 }).expect(400);
  });
});
