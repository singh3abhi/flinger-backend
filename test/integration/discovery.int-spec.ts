import request from 'supertest';
import { createIntegrationApp, signInAs, type IntegrationContext } from './helpers/integration-app';
import { createMember, type Member } from './helpers/members';

const KORAMANGALA = { latitude: 12.9352, longitude: 77.6245 }; // ~4 km from central Bengaluru
const MYSURU = { latitude: 12.2958, longitude: 76.6394 }; // ~130 km
const MUMBAI = { latitude: 19.076, longitude: 72.8777 }; // ~850 km

describe('Discover deck (integration)', () => {
  let ctx: IntegrationContext;
  let maya: Member;
  const http = () => request(ctx.app.getHttpServer());
  const as = (m: Member, req: request.Test) => req.set('Authorization', `Bearer ${m.token}`);
  const deck = async (m: Member = maya) => {
    const res = await as(m, http().get('/v1/discovery/deck?limit=20')).expect(200);
    return res.body as {
      items: { userId: string; distanceKm: number | null; photos: unknown[]; prompts: unknown[] }[];
      radiusKm: number;
      widened: boolean;
    };
  };
  const ids = (d: { items: { userId: string }[] }) => d.items.map((i) => i.userId).sort();

  beforeAll(async () => {
    ctx = await createIntegrationApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    maya = await createMember(ctx, {
      email: 'maya@example.com',
      gender: 'woman',
      interestedIn: ['men'],
      age: 29,
      minAge: 25,
      maxAge: 40,
      expandRadiusWhenEmpty: false,
    });
  });

  it('shows only people both sides would want to see', async () => {
    const good = await createMember(ctx, {
      email: 'good@example.com',
      gender: 'man',
      interestedIn: ['women'],
      age: 31,
      ...KORAMANGALA,
    });
    // Each of these fails exactly one rule.
    await createMember(ctx, {
      email: 'wantsmen@example.com',
      gender: 'man',
      interestedIn: ['men'],
    });
    await createMember(ctx, {
      email: 'woman@example.com',
      gender: 'woman',
      interestedIn: ['women'],
    });
    await createMember(ctx, {
      email: 'old@example.com',
      gender: 'man',
      interestedIn: ['women'],
      age: 45,
    });
    await createMember(ctx, {
      email: 'picky@example.com',
      gender: 'man',
      interestedIn: ['women'],
      maxAge: 26,
    });
    await createMember(ctx, {
      email: 'far@example.com',
      gender: 'man',
      interestedIn: ['women'],
      ...MUMBAI,
    });
    await createMember(ctx, {
      email: 'nophotos@example.com',
      gender: 'man',
      interestedIn: ['women'],
      photos: 0,
    });
    const paused = await createMember(ctx, {
      email: 'paused@example.com',
      gender: 'man',
      interestedIn: ['women'],
    });
    await ctx.db.query("UPDATE users SET status = 'paused' WHERE id = $1", [paused.id]);

    const result = await deck();
    expect(ids(result)).toEqual([good.id]);
    expect(result).toMatchObject({ radiusKm: 50, widened: false });
    expect(result.items[0]).toMatchObject({ distanceKm: 5 });
    expect(result.items[0].photos).toHaveLength(4);
    expect(result.items[0].prompts).toHaveLength(3);
  });

  it('never sends exact location data, and hides distance when the member asks', async () => {
    await createMember(ctx, {
      email: 'shy@example.com',
      gender: 'man',
      interestedIn: ['women'],
      showDistance: false,
    });
    const result = await deck();
    expect(result.items[0].distanceKm).toBeNull();
    const body = JSON.stringify(result);
    expect(body).not.toMatch(/latitude|longitude|birthDate|12\.97/);
  });

  it('does not show people again after a like or a pass', async () => {
    const a = await createMember(ctx, {
      email: 'anil@example.com',
      gender: 'man',
      interestedIn: ['women'],
    });
    const b = await createMember(ctx, {
      email: 'bala@example.com',
      gender: 'man',
      interestedIn: ['women'],
    });
    const c = await createMember(ctx, {
      email: 'chand@example.com',
      gender: 'man',
      interestedIn: ['women'],
    });
    expect(ids(await deck())).toEqual([a.id, b.id, c.id].sort());

    await as(maya, http().post('/v1/likes'))
      .send({ targetId: a.id, itemType: 'photo', itemId: a.photoIds[0] })
      .expect(200);
    await as(maya, http().post('/v1/passes')).send({ targetId: b.id }).expect(204);
    // Force a refill.
    await ctx.redis.del(`flinger:local:disc:deck:${maya.id}`);
    expect(ids(await deck())).toEqual([c.id]);
  });

  it('widens the radius when nobody is nearby, only if the member allows it', async () => {
    const mysore = await createMember(ctx, {
      email: 'mysore@example.com',
      gender: 'man',
      interestedIn: ['women'],
      maxDistanceKm: 200,
      ...MYSURU,
    });
    expect(ids(await deck())).toEqual([]);

    await ctx.db.query(
      'UPDATE preferences SET expand_radius_when_empty = true WHERE user_id = $1',
      [maya.id],
    );
    await ctx.redis.del(`flinger:local:disc:deck:${maya.id}`);
    const wide = await deck();
    expect(ids(wide)).toEqual([mysore.id]);
    expect(wide).toMatchObject({ radiusKm: 200, widened: true });
  });

  it('opens full profiles only for people shown, who liked me, or matched', async () => {
    const shown = await createMember(ctx, {
      email: 'shown@example.com',
      gender: 'man',
      interestedIn: ['women'],
    });
    const stranger = await createMember(ctx, {
      email: 'stranger@example.com',
      gender: 'man',
      interestedIn: ['men'],
    });
    const admirer = await createMember(ctx, {
      email: 'admirer@example.com',
      gender: 'man',
      interestedIn: ['men'],
    });

    await as(maya, http().get(`/v1/profiles/${shown.id}`)).expect(404);
    await deck();
    await as(maya, http().get(`/v1/profiles/${shown.id}`)).expect(200);

    const hidden = await as(maya, http().get(`/v1/profiles/${stranger.id}`)).expect(404);
    expect(hidden.body.code).toBe('MEMBER_NOT_FOUND');

    await as(admirer, http().post('/v1/likes'))
      .send({ targetId: maya.id, itemType: 'photo', itemId: maya.photoIds[0] })
      .expect(200);
    const profile = await as(maya, http().get(`/v1/profiles/${admirer.id}`)).expect(200);
    expect(profile.body).toMatchObject({ userId: admirer.id, displayName: 'admirer' });
  });

  it('explains when the member is not ready to discover', async () => {
    const token = await signInAs(ctx, 'new@example.com');
    const res = await http()
      .get('/v1/discovery/deck')
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
    expect(res.body.code).toBe('DISCOVERY_NOT_READY');
  });
});
