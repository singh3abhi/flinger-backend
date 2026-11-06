import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { LogPushSender } from '@/modules/notifications';
import { createIntegrationApp, type IntegrationContext } from './helpers/integration-app';
import { createMember, type Member } from './helpers/members';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Settings, pause and sessions (integration)', () => {
  let ctx: IntegrationContext;
  let mira: Member;
  let neel: Member;
  let pushes: LogPushSender;
  const http = () => request(ctx.app.getHttpServer());
  const as = (m: Member, req: request.Test) => req.set('Authorization', `Bearer ${m.token}`);

  async function match(): Promise<string> {
    await as(mira, http().post('/v1/likes')).send({
      targetId: neel.id,
      itemType: 'photo',
      itemId: neel.photoIds[0],
    });
    const res = await as(neel, http().post('/v1/likes')).send({
      targetId: mira.id,
      itemType: 'photo',
      itemId: mira.photoIds[0],
    });
    return res.body.matchId;
  }
  const say = (from: Member, conversationId: string, body: string) =>
    as(from, http().post(`/v1/conversations/${conversationId}/messages`))
      .send({ clientMsgId: randomUUID(), body })
      .expect(200);

  beforeAll(async () => {
    ctx = await createIntegrationApp();
    pushes = ctx.moduleRef.get(LogPushSender);
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    pushes.sent.length = 0;
    mira = await createMember(ctx, {
      email: 'mira@example.com',
      gender: 'woman',
      interestedIn: ['men'],
    });
    neel = await createMember(ctx, {
      email: 'neel@example.com',
      gender: 'man',
      interestedIn: ['women'],
    });
  });

  it('has defaults and saves partial changes', async () => {
    const defaults = await as(mira, http().get('/v1/me/settings')).expect(200);
    expect(defaults.body).toEqual({
      readReceipts: false,
      notifyNewMatches: true,
      notifyNewMessages: true,
    });
    const changed = await as(mira, http().patch('/v1/me/settings'))
      .send({ readReceipts: true })
      .expect(200);
    expect(changed.body).toEqual({
      readReceipts: true,
      notifyNewMatches: true,
      notifyNewMessages: true,
    });
    await as(mira, http().patch('/v1/me/settings')).send({ unknown: 1 }).expect(400);
  });

  it('shows read positions only when both have read receipts on', async () => {
    const conversationId = await match();
    const sent = await say(mira, conversationId, 'hello');
    await as(neel, http().post(`/v1/conversations/${conversationId}/read`))
      .send({ upToMessageId: sent.body.id })
      .expect(204);

    const read = () =>
      as(mira, http().get(`/v1/conversations/${conversationId}/messages`)).expect(200);
    expect((await read()).body.theirReadUpTo).toBeNull();

    await as(mira, http().patch('/v1/me/settings')).send({ readReceipts: true }).expect(200);
    expect((await read()).body.theirReadUpTo).toBeNull(); // only one of them

    await as(neel, http().patch('/v1/me/settings')).send({ readReceipts: true }).expect(200);
    expect((await read()).body.theirReadUpTo).toBe(sent.body.id);
  });

  it('respects notification opt-outs', async () => {
    await as(neel, http().put('/v1/devices/device-neel-01/push-token'))
      .send({ provider: 'expo', token: 'ExponentPushToken[neel]', platform: 'android' })
      .expect(204);
    await as(neel, http().patch('/v1/me/settings')).send({ notifyNewMessages: false }).expect(200);
    const conversationId = await match();
    pushes.sent.length = 0;
    await say(mira, conversationId, 'are you there?');
    await wait(200);
    expect(pushes.sent).toHaveLength(0);
  });

  it('pausing hides me from Discover and likes, keeps chats, and is reversible', async () => {
    const conversationId = await match();
    await as(neel, http().post('/v1/me/pause')).expect(204);
    await as(neel, http().post('/v1/me/pause')).expect(204); // idempotent

    expect((await as(neel, http().get('/v1/me')).expect(200)).body.status).toBe('paused');
    const deck = await as(neel, http().get('/v1/discovery/deck')).expect(409);
    expect(deck.body.code).toBe('ACCOUNT_PAUSED');

    const other = await createMember(ctx, {
      email: 'ritu@example.com',
      gender: 'woman',
      interestedIn: ['men'],
    });
    const otherDeck = await as(other, http().get('/v1/discovery/deck')).expect(200);
    expect(otherDeck.body.items.map((c: { userId: string }) => c.userId)).not.toContain(neel.id);
    await as(other, http().post('/v1/likes'))
      .send({ targetId: neel.id, itemType: 'photo', itemId: neel.photoIds[0] })
      .expect(404);

    // A match can still open the paused profile; nobody else can.
    await as(mira, http().get(`/v1/profiles/${neel.id}`)).expect(200);
    await as(other, http().get(`/v1/profiles/${neel.id}`)).expect(404);

    await say(mira, conversationId, 'still chatting');
    await say(neel, conversationId, 'yes');

    await as(neel, http().delete('/v1/me/pause')).expect(204);
    expect((await as(neel, http().get('/v1/me')).expect(200)).body.status).toBe('active');
  });

  it('signs out every device', async () => {
    const second = await createMember(ctx, { email: 'neel2@example.com' });
    await as(neel, http().post('/v1/auth/logout-all')).expect(204);
    await as(neel, http().get('/v1/me')).expect(401);
    await as(second, http().get('/v1/me')).expect(200);
  });
});
