import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AccountService } from '@/modules/account';
import { createIntegrationApp, signInAs, type IntegrationContext } from './helpers/integration-app';
import { createMember, type Member } from './helpers/members';

describe('Delete account and download my data (integration)', () => {
  let ctx: IntegrationContext;
  let sana: Member;
  let arjun: Member;
  let conversationId: string;
  const http = () => request(ctx.app.getHttpServer());
  const as = (m: Member, req: request.Test) => req.set('Authorization', `Bearer ${m.token}`);

  beforeAll(async () => {
    ctx = await createIntegrationApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    sana = await createMember(ctx, {
      email: 'sana@example.com',
      gender: 'woman',
      interestedIn: ['men'],
    });
    arjun = await createMember(ctx, {
      email: 'arjun@example.com',
      gender: 'man',
      interestedIn: ['women'],
    });
    await as(sana, http().post('/v1/likes')).send({
      targetId: arjun.id,
      itemType: 'photo',
      itemId: arjun.photoIds[0],
      comment: 'Nice trek pic',
    });
    conversationId = (
      await as(arjun, http().post('/v1/likes')).send({
        targetId: sana.id,
        itemType: 'photo',
        itemId: sana.photoIds[0],
      })
    ).body.matchId;
    await as(sana, http().post(`/v1/conversations/${conversationId}/messages`)).send({
      clientMsgId: randomUUID(),
      body: 'Hi Arjun',
    });
  });

  it('needs the typed confirmation', async () => {
    const res = await as(sana, http().delete('/v1/me')).send({ confirm: 'delete' }).expect(400);
    expect(res.body.code).toBe('CONFIRMATION_REQUIRED');
    await as(sana, http().get('/v1/me')).expect(200);
  });

  it('deleting hides me at once, closes chats, signs me out and frees my email', async () => {
    await as(sana, http().delete('/v1/me')).send({ confirm: 'DELETE' }).expect(204);

    await as(sana, http().get('/v1/me')).expect(401);
    expect((await as(arjun, http().get('/v1/conversations')).expect(200)).body.items).toEqual([]);
    await as(arjun, http().get(`/v1/profiles/${sana.id}`)).expect(404);
    const deck = await as(arjun, http().get('/v1/discovery/deck')).expect(200);
    expect(deck.body.items.map((c: { userId: string }) => c.userId)).not.toContain(sana.id);

    // The same email can start a new, separate account straight away.
    const token = await signInAs(ctx, 'sana@example.com');
    const me = await http().get('/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body).toMatchObject({ status: 'pending' });
    expect(me.body.id).not.toBe(sana.id);
  });

  it('erases deleted accounts after 30 days, not before', async () => {
    await as(sana, http().delete('/v1/me')).send({ confirm: 'DELETE' }).expect(204);
    const account = ctx.moduleRef.get(AccountService);

    expect(await account.purgeDeleted(new Date(Date.now() + 29 * 86_400_000))).toBe(0);
    expect(await account.purgeDeleted(new Date(Date.now() + 31 * 86_400_000))).toBe(1);

    const left = await ctx.db.query(
      `SELECT (SELECT count(*) FROM users WHERE id = $1)::int AS users,
              (SELECT count(*) FROM profile_photos WHERE user_id = $1)::int AS photos,
              (SELECT count(*) FROM swipes WHERE swiper_id = $1 OR target_id = $1)::int AS swipes`,
      [sana.id],
    );
    expect(left.rows[0]).toEqual({ users: 0, photos: 0, swipes: 0 });
    // Arjun's account is untouched.
    await as(arjun, http().get('/v1/me')).expect(200);
  });

  it('exports my data as a downloadable JSON file', async () => {
    const created = await as(sana, http().post('/v1/me/export')).expect(201);
    expect(created.body).toMatchObject({
      status: 'ready',
      url: expect.stringContaining('X-Amz-Signature'),
    });

    const file = (await (await fetch(created.body.url)).json()) as Record<string, unknown[]>;
    expect(file.identities).toEqual([
      expect.objectContaining({ provider: 'email', subject: 'sana@example.com' }),
    ]);
    expect(file.likesSent).toEqual([
      expect.objectContaining({ comment: 'Nice trek pic', to_name: 'arjun' }),
    ]);
    expect(file.messages).toEqual([expect.objectContaining({ body: 'Hi Arjun', from_me: true })]);
    expect(file.matches).toHaveLength(1);

    const again = await as(sana, http().get(`/v1/me/export/${created.body.id}`)).expect(200);
    expect(again.body.status).toBe('ready');
    await as(arjun, http().get(`/v1/me/export/${created.body.id}`)).expect(404);
  });
});
