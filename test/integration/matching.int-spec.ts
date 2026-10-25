import request from 'supertest';
import { MatchingService } from '@/modules/matching';
import { createIntegrationApp, type IntegrationContext } from './helpers/integration-app';
import { createMember, type Member } from './helpers/members';

describe('Likes and matches (integration)', () => {
  let ctx: IntegrationContext;
  let aria: Member;
  let dev: Member;
  const http = () => request(ctx.app.getHttpServer());
  const as = (m: Member, req: request.Test) => req.set('Authorization', `Bearer ${m.token}`);

  const like = (from: Member, to: Member, over: Record<string, unknown> = {}) =>
    as(from, http().post('/v1/likes')).send({
      targetId: to.id,
      itemType: 'photo',
      itemId: to.photoIds[0],
      ...over,
    });

  beforeAll(async () => {
    ctx = await createIntegrationApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    aria = await createMember(ctx, {
      email: 'aria@example.com',
      gender: 'woman',
      interestedIn: ['men'],
    });
    dev = await createMember(ctx, {
      email: 'dev@example.com',
      gender: 'man',
      interestedIn: ['women'],
    });
  });

  it('a like waits in Liked You; liking back makes a match for both', async () => {
    const first = await like(aria, dev, { comment: 'Great smile!' }).expect(200);
    expect(first.body).toMatchObject({ matched: false, matchId: null, likesRemaining: 24 });

    const inbox = await as(dev, http().get('/v1/likes/received')).expect(200);
    expect(inbox.body.items).toHaveLength(1);
    expect(inbox.body.items[0]).toMatchObject({
      from: { userId: aria.id, displayName: 'aria', age: 28, city: 'Bengaluru' },
      item: { type: 'photo', id: dev.photoIds[0] },
      comment: 'Great smile!',
    });
    expect(inbox.body.items[0].item.photoUrl).toContain('X-Amz-Signature');

    const back = await like(dev, aria, {
      itemType: 'prompt',
      itemId: aria.promptAnswerIds[1],
    }).expect(200);
    expect(back.body.matched).toBe(true);

    for (const member of [aria, dev]) {
      const list = await as(member, http().get('/v1/matches')).expect(200);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.items[0].matchId).toBe(back.body.matchId);
    }
    // Answered: no longer waiting in Liked You.
    const after = await as(dev, http().get('/v1/likes/received')).expect(200);
    expect(after.body.items).toEqual([]);
  });

  it('a repeated like is free and returns the same result', async () => {
    await like(aria, dev).expect(200);
    const again = await like(aria, dev).expect(200);
    expect(again.body.likesRemaining).toBe(24);
    const limits = await as(aria, http().get('/v1/me/limits')).expect(200);
    expect(limits.body).toMatchObject({ likesPerDay: 25, likesUsed: 1, likesRemaining: 24 });
  });

  it('stops at 25 likes a day with LIKE_LIMIT_REACHED and a Retry-After', async () => {
    const keys = await ctx.redis.keys('flinger:local:likes:count:*');
    expect(keys).toEqual([]);
    await like(aria, dev).expect(200);
    const [key] = await ctx.redis.keys('flinger:local:likes:count:*');
    await ctx.redis.set(key, '25');

    const other = await createMember(ctx, { email: 'kiran@example.com', gender: 'man' });
    const res = await like(aria, other).expect(429);
    expect(res.body.code).toBe('LIKE_LIMIT_REACHED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(await ctx.redis.get(key)).toBe('25');
  });

  it('two people liking each other at the same moment make exactly one match', async () => {
    const [a, b] = await Promise.all([like(aria, dev), like(dev, aria)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.matched, b.body.matched]).toContain(true);
    const rows = await ctx.db.query('SELECT count(*)::int AS n FROM matches');
    expect(rows.rows[0].n).toBe(1);
  });

  it('rejects liking yourself, a passed person, a missing item and an unfinished profile', async () => {
    await like(aria, aria).expect(400);

    await as(aria, http().post('/v1/passes')).send({ targetId: dev.id }).expect(204);
    const passed = await like(aria, dev).expect(409);
    expect(passed.body.code).toBe('ALREADY_PASSED');

    const kiran = await createMember(ctx, { email: 'kiran@example.com', gender: 'man' });
    const wrongItem = await like(aria, kiran, { itemId: dev.photoIds[0] }).expect(422);
    expect(wrongItem.body.code).toBe('LIKE_ITEM_INVALID');

    await ctx.db.query("UPDATE users SET status = 'pending' WHERE id = $1", [kiran.id]);
    const hidden = await like(aria, kiran, { itemId: kiran.photoIds[0] }).expect(404);
    expect(hidden.body.code).toBe('MEMBER_NOT_FOUND');
  });

  it('unmatching ends it for both, once', async () => {
    await like(aria, dev).expect(200);
    const match = await like(dev, aria).expect(200);
    await as(aria, http().delete(`/v1/matches/${match.body.matchId}`)).expect(204);
    for (const member of [aria, dev]) {
      const list = await as(member, http().get('/v1/matches')).expect(200);
      expect(list.body.items).toEqual([]);
    }
    await as(dev, http().delete(`/v1/matches/${match.body.matchId}`)).expect(404);
  });

  it('remembers who was seen, and rebuilds that memory if Redis loses it', async () => {
    const kiran = await createMember(ctx, { email: 'kiran@example.com', gender: 'man' });
    await like(aria, dev).expect(200);
    await as(aria, http().post('/v1/passes')).send({ targetId: kiran.id }).expect(204);

    const filter = ctx.moduleRef.get(MatchingService).seenFilter();
    const fresh = await createMember(ctx, { email: 'neel@example.com', gender: 'man' });
    expect(await filter.unseen(aria.id, [dev.id, kiran.id, fresh.id])).toEqual([fresh.id]);

    await ctx.redis.flushdb();
    expect(await filter.unseen(aria.id, [dev.id, kiran.id, fresh.id])).toEqual([fresh.id]);
  });

  it('pages through Liked You with a cursor', async () => {
    const admirers = [];
    for (const name of ['m1', 'm2', 'm3']) {
      admirers.push(await createMember(ctx, { email: `${name}@example.com`, gender: 'man' }));
    }
    for (const admirer of admirers) await like(admirer, aria).expect(200);

    const page1 = await as(aria, http().get('/v1/likes/received?limit=2')).expect(200);
    expect(page1.body.items.map((i: { from: { userId: string } }) => i.from.userId)).toEqual([
      admirers[2].id,
      admirers[1].id,
    ]);
    const page2 = await as(
      aria,
      http().get(`/v1/likes/received?limit=2&cursor=${page1.body.nextCursor}`),
    ).expect(200);
    expect(page2.body.items.map((i: { from: { userId: string } }) => i.from.userId)).toEqual([
      admirers[0].id,
    ]);
    expect(page2.body.nextCursor).toBeNull();
  });
});
