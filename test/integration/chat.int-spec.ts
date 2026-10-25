import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { LogPushSender } from '@/modules/notifications';
import {
  createIntegrationApp,
  createRealtimeApp,
  type IntegrationContext,
} from './helpers/integration-app';
import { createMember, type Member } from './helpers/members';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolve with the next `event` on `socket` (or fail after a timeout). */
function next<T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no ${event} within ${timeoutMs} ms`)),
      timeoutMs,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('Chat (integration: REST + Socket.IO + Redis)', () => {
  let ctx: IntegrationContext;
  let realtime: { app: INestApplication; url: string };
  let pushes: LogPushSender;
  let asha: Member;
  let ravi: Member;
  let conversationId: string;
  const sockets: Socket[] = [];
  const http = () => request(ctx.app.getHttpServer());
  const as = (m: Member, req: request.Test) => req.set('Authorization', `Bearer ${m.token}`);

  async function connect(member: Member | { token: string }): Promise<Socket> {
    const socket = io(`${realtime.url}/chat`, {
      transports: ['websocket'],
      auth: { token: member.token },
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', (e) => reject(e));
    });
    return socket;
  }

  const send = (from: Member, body: string, clientMsgId = randomUUID()) =>
    as(from, http().post(`/v1/conversations/${conversationId}/messages`)).send({
      clientMsgId,
      body,
    });

  beforeAll(async () => {
    ctx = await createIntegrationApp();
    realtime = await createRealtimeApp({ LOG_LEVEL: 'error' });
    pushes = ctx.moduleRef.get(LogPushSender);
  });
  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await realtime.app.close();
    await ctx.close();
  });
  beforeEach(async () => {
    for (const s of sockets.splice(0)) s.disconnect();
    await ctx.reset();
    pushes.sent.length = 0;
    asha = await createMember(ctx, {
      email: 'asha@example.com',
      gender: 'woman',
      interestedIn: ['men'],
    });
    ravi = await createMember(ctx, {
      email: 'ravi@example.com',
      gender: 'man',
      interestedIn: ['women'],
    });
    await as(asha, http().post('/v1/likes')).send({
      targetId: ravi.id,
      itemType: 'photo',
      itemId: ravi.photoIds[0],
    });
    const match = await as(ravi, http().post('/v1/likes')).send({
      targetId: asha.id,
      itemType: 'photo',
      itemId: asha.photoIds[0],
    });
    conversationId = match.body.matchId;
  });

  it('lists a new match as an empty conversation, then shows the last message and unread count', async () => {
    let list = await as(asha, http().get('/v1/conversations')).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      id: conversationId,
      member: { userId: ravi.id },
      lastMessage: null,
      unreadCount: 0,
    });

    await send(ravi, 'Hey Asha!').expect(200);
    await send(ravi, 'How is your week going?').expect(200);
    list = await as(asha, http().get('/v1/conversations')).expect(200);
    expect(list.body.items[0]).toMatchObject({
      lastMessage: { body: 'How is your week going?', fromMe: false },
      unreadCount: 2,
    });
    expect(list.body.unreadConversations).toBe(1);

    const mine = await as(ravi, http().get('/v1/conversations')).expect(200);
    expect(mine.body.items[0]).toMatchObject({ lastMessage: { fromMe: true }, unreadCount: 0 });
  });

  it('sending is idempotent by clientMsgId', async () => {
    const clientMsgId = randomUUID();
    const first = await send(asha, 'Hi!', clientMsgId).expect(200);
    const again = await send(asha, 'Hi!', clientMsgId).expect(200);
    expect(again.body.id).toBe(first.body.id);
    const page = await as(ravi, http().get(`/v1/conversations/${conversationId}/messages`)).expect(
      200,
    );
    expect(page.body.items).toHaveLength(1);
  });

  it('pages history oldest-first and gap-fills after a known message', async () => {
    const ids: string[] = [];
    for (let i = 1; i <= 5; i += 1)
      ids.push((await send(i % 2 ? asha : ravi, `m${i}`).expect(200)).body.id);

    const latest = await as(
      asha,
      http().get(`/v1/conversations/${conversationId}/messages?limit=2`),
    ).expect(200);
    expect(latest.body.items.map((m: { body: string }) => m.body)).toEqual(['m4', 'm5']);
    expect(latest.body.hasMore).toBe(true);

    const older = await as(
      asha,
      http().get(`/v1/conversations/${conversationId}/messages?limit=10&before=${ids[3]}`),
    ).expect(200);
    expect(older.body.items.map((m: { body: string }) => m.body)).toEqual(['m1', 'm2', 'm3']);
    expect(older.body.hasMore).toBe(false);

    const gap = await as(
      asha,
      http().get(`/v1/conversations/${conversationId}/messages?after=${ids[2]}`),
    ).expect(200);
    const bodies = gap.body.items.map((m: { body: string }) => m.body);
    expect(bodies).toEqual(expect.arrayContaining(['m4', 'm5']));
  });

  it('marking read clears the unread count, and never moves backwards', async () => {
    const first = (await send(ravi, 'one').expect(200)).body.id;
    const second = (await send(ravi, 'two').expect(200)).body.id;
    await as(asha, http().post(`/v1/conversations/${conversationId}/read`))
      .send({ upToMessageId: second })
      .expect(204);
    await as(asha, http().post(`/v1/conversations/${conversationId}/read`))
      .send({ upToMessageId: first })
      .expect(204);
    const list = await as(asha, http().get('/v1/conversations')).expect(200);
    expect(list.body.items[0].unreadCount).toBe(0);
  });

  it('only the two people in the match can read or write, and unmatching closes it', async () => {
    const outsider = await createMember(ctx, { email: 'out@example.com' });
    await as(outsider, http().get(`/v1/conversations/${conversationId}/messages`)).expect(404);
    await send(outsider, 'hello?').expect(404);

    await as(asha, http().delete(`/v1/matches/${conversationId}`)).expect(204);
    const closed = await send(ravi, 'still there?').expect(404);
    expect(closed.body.code).toBe('CONVERSATION_NOT_FOUND');
    const list = await as(ravi, http().get('/v1/conversations')).expect(200);
    expect(list.body.items).toEqual([]);
  });

  it('delivers messages live over the socket, with an ack, typing and read sync', async () => {
    const ashaSocket = await connect(asha);
    const raviSocket = await connect(ravi);

    const incoming = next<{ body: string; senderId: string }>(raviSocket, 'message:new');
    const ack = (await ashaSocket.emitWithAck('message:send', {
      conversationId,
      clientMsgId: randomUUID(),
      body: '  Live hello  ',
    })) as { ok: boolean; message: { id: string; body: string } };
    expect(ack).toMatchObject({ ok: true, message: { body: 'Live hello' } });
    expect(await incoming).toMatchObject({ body: 'Live hello', senderId: asha.id });

    const typing = next<{ conversationId: string }>(raviSocket, 'typing');
    await ashaSocket.emitWithAck('typing', { conversationId });
    expect(await typing).toEqual({ conversationId, userId: asha.id });

    const readAck = (await raviSocket.emitWithAck('read', {
      conversationId,
      upToMessageId: ack.message.id,
    })) as { ok: boolean };
    expect(readAck.ok).toBe(true);
    const list = await as(ravi, http().get('/v1/conversations')).expect(200);
    expect(list.body.items[0].unreadCount).toBe(0);
  });

  it('refuses bad input over the socket with a code instead of crashing', async () => {
    const socket = await connect(asha);
    const tooLong = (await socket.emitWithAck('message:send', {
      conversationId,
      clientMsgId: randomUUID(),
      body: 'x'.repeat(2001),
    })) as { ok: boolean; code: string };
    expect(tooLong).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });

    const stranger = (await socket.emitWithAck('message:send', {
      conversationId: randomUUID(),
      clientMsgId: randomUUID(),
      body: 'hi',
    })) as { ok: boolean; code: string };
    expect(stranger).toMatchObject({ ok: false, code: 'CONVERSATION_NOT_FOUND' });
  });

  it('rejects sockets without a valid session', async () => {
    await expect(connect({ token: 'not-a-token' })).rejects.toThrow('UNAUTHORIZED');
    await as(asha, http().post('/v1/auth/logout')).expect(204);
    await expect(connect(asha)).rejects.toThrow('UNAUTHORIZED');
  });

  it('announces a new match live to both people', async () => {
    const neha = await createMember(ctx, {
      email: 'neha@example.com',
      gender: 'woman',
      interestedIn: ['men'],
    });
    const raviSocket = await connect(ravi);
    await as(neha, http().post('/v1/likes')).send({
      targetId: ravi.id,
      itemType: 'photo',
      itemId: ravi.photoIds[0],
    });
    const announced = next<{ matchId: string; member: { userId: string } }>(
      raviSocket,
      'match:new',
    );
    await as(ravi, http().post('/v1/likes')).send({
      targetId: neha.id,
      itemType: 'photo',
      itemId: neha.photoIds[0],
    });
    expect((await announced).member.userId).toBe(neha.id);
  });

  it('pushes to members who are away (no text, collapsed), never to someone with the app open', async () => {
    await as(asha, http().put('/v1/devices/device-asha-01/push-token'))
      .send({ provider: 'expo', token: 'ExponentPushToken[asha-test-token]', platform: 'ios' })
      .expect(204);
    pushes.sent.length = 0;

    await send(ravi, 'first').expect(200);
    await send(ravi, 'second').expect(200);
    await wait(200);
    expect(pushes.sent).toHaveLength(1);
    expect(pushes.sent[0]).toMatchObject({
      title: 'ravi',
      body: 'Sent you a message',
      data: { conversationId, type: 'new_message' },
    });
    expect(JSON.stringify(pushes.sent[0])).not.toContain('first');

    pushes.sent.length = 0;
    await ctx.redis.del(...(await ctx.redis.keys('flinger:local:push:collapse:*')));
    await connect(asha);
    await send(ravi, 'third').expect(200);
    await wait(200);
    expect(pushes.sent).toHaveLength(0);
  });
});
