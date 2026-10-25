import request from 'supertest';
import { LEGAL_VERSION } from '@/common/limits';
import { ageOn, todayInIndia } from '@/modules/profiles/age';
import { createIntegrationApp, signInAs, type IntegrationContext } from './helpers/integration-app';

/** A YYYY-MM-DD birth date that makes someone exactly `years` old today (in India). */
function birthDateForAge(years: number): string {
  const [y, m, d] = todayInIndia().split('-').map(Number);
  const date = new Date(Date.UTC(y - years, m - 1, d));
  return date.toISOString().slice(0, 10);
}

describe('Onboarding profile (integration: real Postgres + Redis)', () => {
  let ctx: IntegrationContext;
  let token: string;
  const http = () => request(ctx.app.getHttpServer());
  const authed = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    ctx = await createIntegrationApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    token = await signInAs(ctx, 'meera@example.com');
  });

  it('a new account has an empty profile that resumes at the first step', async () => {
    const res = await authed(http().get('/v1/me/profile')).expect(200);
    expect(res.body).toMatchObject({
      displayName: null,
      birthDate: null,
      age: null,
      interestedIn: [],
      prompts: [],
      onboarding: { completed: false, nextStep: 'basics' },
    });
  });

  it('saves answers step by step and moves the next step forward', async () => {
    const birthDate = birthDateForAge(27);
    let res = await authed(http().patch('/v1/me/profile'))
      .send({ displayName: '  Meera ', birthDate })
      .expect(200);
    expect(res.body).toMatchObject({
      displayName: 'Meera',
      birthDate,
      age: 27,
      onboarding: { nextStep: 'gender' },
    });

    res = await authed(http().patch('/v1/me/profile'))
      .send({
        gender: 'woman',
        interestedIn: ['men', 'non_binary'],
        hopingToFind: ['life_partner'],
        heightCm: 163,
        values: ['kindness', 'honesty'],
        kidsStatus: 'no_kids',
        religion: 'hindu',
        causes: [],
      })
      .expect(200);
    expect(res.body).toMatchObject({
      gender: 'woman',
      interestedIn: ['men', 'non_binary'],
      hopingToFind: ['life_partner'],
      heightCm: 163,
      values: ['honesty', 'kindness'],
      kidsStatus: 'no_kids',
      familyPlans: null,
      religion: 'hindu',
      causes: [],
      // Optional questions are skippable; photos are the next required step.
      onboarding: { nextStep: 'photos' },
    });
    expect(res.body.onboarding.missing).toEqual(['photos', 'prompts', 'location', 'consents']);
  });

  it('multi-selects replace the whole list, and optional answers can be cleared', async () => {
    await authed(http().patch('/v1/me/profile'))
      .send({ values: ['kindness', 'honesty', 'loyalty'], religion: 'sikh' })
      .expect(200);
    const res = await authed(http().patch('/v1/me/profile'))
      .send({ values: ['curiosity'], religion: null })
      .expect(200);
    expect(res.body.values).toEqual(['curiosity']);
    expect(res.body.religion).toBeNull();
    const rows = await ctx.db.query(
      "SELECT count(*)::int AS n FROM profile_attributes WHERE kind = 'values'",
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it('rejects anyone under 18 with PROFILE_UNDERAGE and saves nothing', async () => {
    const res = await authed(http().patch('/v1/me/profile'))
      .send({ displayName: 'Kid', birthDate: birthDateForAge(17) })
      .expect(422);
    expect(res.body.code).toBe('PROFILE_UNDERAGE');
    const profile = await authed(http().get('/v1/me/profile')).expect(200);
    expect(profile.body.displayName).toBeNull();
  });

  it('accepts someone who turns 18 today', async () => {
    const birthDate = birthDateForAge(18);
    expect(ageOn(birthDate, todayInIndia())).toBe(18);
    await authed(http().patch('/v1/me/profile')).send({ birthDate }).expect(200);
  });

  it('locks the birthday once set (BIRTHDATE_LOCKED), but resending the same date is fine', async () => {
    const birthDate = birthDateForAge(30);
    await authed(http().patch('/v1/me/profile')).send({ birthDate }).expect(200);
    await authed(http().patch('/v1/me/profile')).send({ birthDate }).expect(200);
    const res = await authed(http().patch('/v1/me/profile'))
      .send({ birthDate: birthDateForAge(25) })
      .expect(409);
    expect(res.body.code).toBe('BIRTHDATE_LOCKED');
  });

  it('validates option ids and limits', async () => {
    const cases: Record<string, unknown>[] = [
      { gender: 'robot' },
      { hopingToFind: ['marriage', 'casual', 'life_partner'] }, // max 2
      { values: ['kindness', 'kindness'] }, // duplicates
      { heightCm: 300 },
      { displayName: 'R' },
      { displayName: '1234' },
      { religion: 'mormon' }, // dropped for India
      { unknownField: true },
    ];
    for (const body of cases) {
      const res = await authed(http().patch('/v1/me/profile')).send(body);
      expect({ body, status: res.status, code: res.body.code }).toEqual({
        body,
        status: 400,
        code: 'VALIDATION_FAILED',
      });
    }
  });

  it('lists the prompt library and saves up to 3 answers in order', async () => {
    const library = await authed(http().get('/v1/prompts')).expect(200);
    expect(library.body.items.length).toBeGreaterThanOrEqual(30);
    const [a, b, c] = library.body.items as { id: string; text: string }[];

    let res = await authed(http().put('/v1/me/prompts'))
      .send({
        prompts: [
          { promptId: b.id, answer: ' Filter coffee and a long walk. ' },
          { promptId: a.id, answer: 'Finding the best chai stall.' },
        ],
      })
      .expect(200);
    expect(res.body.prompts).toEqual([
      { promptId: b.id, text: b.text, answer: 'Filter coffee and a long walk.', position: 1 },
      { promptId: a.id, text: a.text, answer: 'Finding the best chai stall.', position: 2 },
    ]);
    expect(res.body.onboarding.missing).toContain('prompts');

    res = await authed(http().put('/v1/me/prompts'))
      .send({
        prompts: [
          { promptId: a.id, answer: 'one' },
          { promptId: b.id, answer: 'two' },
          { promptId: c.id, answer: 'three' },
        ],
      })
      .expect(200);
    expect(res.body.prompts.map((p: { position: number }) => p.position)).toEqual([1, 2, 3]);
    expect(res.body.onboarding.missing).not.toContain('prompts');
  });

  it('rejects unknown prompts, duplicates, too many and over-long answers', async () => {
    const unknown = await authed(http().put('/v1/me/prompts'))
      .send({ prompts: [{ promptId: 'not_a_prompt', answer: 'hi' }] })
      .expect(422);
    expect(unknown.body.code).toBe('PROMPT_NOT_FOUND');

    const bad = [
      {
        prompts: [
          { promptId: 'perfect_sunday', answer: 'a' },
          { promptId: 'perfect_sunday', answer: 'b' },
        ],
      },
      { prompts: [{ promptId: 'perfect_sunday', answer: 'x'.repeat(151) }] },
      { prompts: [{ promptId: 'perfect_sunday', answer: '   ' }] },
      {
        prompts: ['perfect_sunday', 'weirdly_good_at', 'green_flag', 'dealbreaker'].map(
          (promptId) => ({
            promptId,
            answer: 'x',
          }),
        ),
      },
    ];
    for (const body of bad) {
      await authed(http().put('/v1/me/prompts')).send(body).expect(400);
    }
  });

  it('records consents for the current legal version only', async () => {
    const config = await http().get('/v1/config').expect(200);
    expect(config.body.legalVersion).toBe(LEGAL_VERSION);

    const stale = await authed(http().post('/v1/me/consents'))
      .send({ documents: ['terms'], version: '2000-01-01' })
      .expect(409);
    expect(stale.body.code).toBe('CONSENT_VERSION_MISMATCH');

    await authed(http().post('/v1/me/consents'))
      .send({ documents: ['terms', 'privacy', 'guidelines'], version: LEGAL_VERSION })
      .expect(204);
    // Accepting again is a no-op.
    await authed(http().post('/v1/me/consents'))
      .send({ documents: ['terms'], version: LEGAL_VERSION })
      .expect(204);

    const profile = await authed(http().get('/v1/me/profile')).expect(200);
    expect(profile.body.onboarding.missing).not.toContain('consents');
    const rows = await ctx.db.query('SELECT count(*)::int AS n FROM user_consents');
    expect(rows.rows[0].n).toBe(3);
  });

  it('keeps each member’s profile private to them', async () => {
    await authed(http().patch('/v1/me/profile')).send({ displayName: 'Meera' }).expect(200);
    const otherToken = await signInAs(ctx, 'arjun@example.com');
    const other = await http()
      .get('/v1/me/profile')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(other.body.displayName).toBeNull();
  });

  it('requires a session', async () => {
    await http().get('/v1/me/profile').expect(401);
    await http().get('/v1/prompts').expect(401);
  });
});
