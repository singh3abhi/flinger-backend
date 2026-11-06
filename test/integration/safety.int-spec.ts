import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createIntegrationApp, type IntegrationContext } from './helpers/integration-app';
import { createMember, type Member } from './helpers/members';

describe('Block and report (integration)', () => {
  let ctx: IntegrationContext;
  let tara: Member;
  let vik: Member;
  const http = () => request(ctx.app.getHttpServer());
  const as = (m: Member, req: request.Test) => req.set('Authorization', `Bearer ${m.token}`);
  const like = (from: Member, to: Member) =>
    as(from, http().post('/v1/likes')).send({
      targetId: to.id,
      itemType: 'photo',
      itemId: to.photoIds[0],
    });

  async function match(): Promise<string> {
    await like(tara, vik).expect(200);
    return (await like(vik, tara).expect(200)).body.matchId;
  }

  beforeAll(async () => {
    ctx = await createIntegrationApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    tara = await createMember(ctx, {
      email: 'tara@example.com',
      gender: 'woman',
      interestedIn: ['men'],
    });
    vik = await createMember(ctx, {
      email: 'vik@example.com',
      gender: 'man',
      interestedIn: ['women'],
    });
  });

  it('blocking ends the match and closes the chat for both', async () => {
    const conversationId = await match();
    await as(vik, http().post(`/v1/conversations/${conversationId}/messages`))
      .send({ clientMsgId: randomUUID(), body: 'hey' })
      .expect(200);

    await as(tara, http().post('/v1/blocks')).send({ userId: vik.id }).expect(204);
    await as(tara, http().post('/v1/blocks')).send({ userId: vik.id }).expect(204); // idempotent

    for (const m of [tara, vik]) {
      expect((await as(m, http().get('/v1/conversations')).expect(200)).body.items).toEqual([]);
      expect((await as(m, http().get('/v1/matches')).expect(200)).body.items).toEqual([]);
    }
    await as(vik, http().post(`/v1/conversations/${conversationId}/messages`))
      .send({ clientMsgId: randomUUID(), body: 'still there?' })
      .expect(404);
  });

  it('the blocked person disappears from Discover, Liked You and profile views, both ways', async () => {
    await like(vik, tara).expect(200);
    expect((await as(tara, http().get('/v1/likes/received')).expect(200)).body.items).toHaveLength(
      1,
    );
    await as(tara, http().get(`/v1/profiles/${vik.id}`)).expect(200);

    await as(vik, http().post('/v1/blocks')).send({ userId: tara.id }).expect(204);

    expect((await as(tara, http().get('/v1/likes/received')).expect(200)).body.items).toEqual([]);
    await as(tara, http().get(`/v1/profiles/${vik.id}`)).expect(404);
    await as(vik, http().get(`/v1/profiles/${tara.id}`)).expect(404);
    const deck = await as(tara, http().get('/v1/discovery/deck')).expect(200);
    expect(deck.body.items.map((c: { userId: string }) => c.userId)).not.toContain(vik.id);
    const liked = await like(tara, vik).expect(404);
    expect(liked.body.code).toBe('MEMBER_NOT_FOUND');
  });

  it('lists and unblocks', async () => {
    await as(tara, http().post('/v1/blocks')).send({ userId: vik.id }).expect(204);
    const list = await as(tara, http().get('/v1/blocks')).expect(200);
    expect(list.body.items).toEqual([
      { userId: vik.id, displayName: 'vik', blockedAt: expect.any(String) },
    ]);
    await as(tara, http().delete(`/v1/blocks/${vik.id}`)).expect(204);
    expect((await as(tara, http().get('/v1/blocks')).expect(200)).body.items).toEqual([]);
  });

  it('reports keep evidence: a message report snapshots the conversation', async () => {
    const conversationId = await match();
    const ids: string[] = [];
    for (const body of ['hi', 'send money pls', 'urgent']) {
      const res = await as(vik, http().post(`/v1/conversations/${conversationId}/messages`))
        .send({ clientMsgId: randomUUID(), body })
        .expect(200);
      ids.push(res.body.id);
    }
    const report = await as(tara, http().post('/v1/reports'))
      .send({
        reportedId: vik.id,
        targetType: 'message',
        targetId: ids[1],
        reason: 'scam',
        alsoBlock: true,
      })
      .expect(201);

    const row = await ctx.db.query('SELECT reason, snapshot, status FROM reports WHERE id = $1', [
      report.body.id,
    ]);
    expect(row.rows[0].reason).toBe('scam');
    expect(row.rows[0].status).toBe('open');
    expect(row.rows[0].snapshot.messages.map((m: { body: string }) => m.body)).toEqual([
      'hi',
      'send money pls',
    ]);
    // alsoBlock: the chat is closed.
    expect((await as(tara, http().get('/v1/conversations')).expect(200)).body.items).toEqual([]);
  });

  it('reports a prompt or photo only if it belongs to the reported person', async () => {
    const prompt = await as(tara, http().post('/v1/reports'))
      .send({
        reportedId: vik.id,
        targetType: 'prompt',
        targetId: vik.promptAnswerIds[0],
        reason: 'inappropriate',
      })
      .expect(201);
    const row = await ctx.db.query('SELECT snapshot FROM reports WHERE id = $1', [prompt.body.id]);
    expect(row.rows[0].snapshot).toMatchObject({ answer: 'Answer 1' });

    const wrong = await as(tara, http().post('/v1/reports'))
      .send({
        reportedId: vik.id,
        targetType: 'photo',
        targetId: tara.photoIds[0],
        reason: 'fake_or_spam',
      })
      .expect(422);
    expect(wrong.body.code).toBe('REPORT_TARGET_INVALID');

    // Someone else's conversation can't be reported as evidence.
    const outsider = await createMember(ctx, { email: 'out@example.com' });
    const conversationId = await match();
    const msg = await as(vik, http().post(`/v1/conversations/${conversationId}/messages`))
      .send({ clientMsgId: randomUUID(), body: 'private' })
      .expect(200);
    await as(outsider, http().post('/v1/reports'))
      .send({ reportedId: vik.id, targetType: 'message', targetId: msg.body.id, reason: 'other' })
      .expect(422);
  });

  it('validates reports', async () => {
    await as(tara, http().post('/v1/reports'))
      .send({ reportedId: vik.id, targetType: 'photo', reason: 'other' })
      .expect(400);
    await as(tara, http().post('/v1/reports'))
      .send({ reportedId: vik.id, targetType: 'user', reason: 'nope' })
      .expect(400);
    await as(tara, http().post('/v1/reports'))
      .send({ reportedId: tara.id, targetType: 'user', reason: 'other' })
      .expect(400);
  });
});
