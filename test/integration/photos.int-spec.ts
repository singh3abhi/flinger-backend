import request from 'supertest';
import { createIntegrationApp, signInAs, type IntegrationContext } from './helpers/integration-app';

/** The first bytes of a real JPEG are all the server checks; the rest is filler. */
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.alloc(2048, 7),
]);

interface Upload {
  photo: { id: string; position: number; status: string; url: string | null };
  upload: { url: string; method: 'PUT'; headers: Record<string, string> };
}

describe('Profile photos (integration: Postgres + Redis + SeaweedFS)', () => {
  let ctx: IntegrationContext;
  let token: string;
  const http = () => request(ctx.app.getHttpServer());
  const authed = (req: request.Test, as = token) => req.set('Authorization', `Bearer ${as}`);

  async function reserve(as = token): Promise<Upload> {
    const res = await authed(http().post('/v1/me/photos'), as)
      .send({ contentType: 'image/jpeg', byteSize: JPEG.length })
      .expect(201);
    return res.body as Upload;
  }

  async function put(
    upload: Upload,
    body: Buffer | string = JPEG,
    headers = upload.upload.headers,
  ) {
    return fetch(upload.upload.url, { method: 'PUT', headers, body });
  }

  /** Reserve, upload the bytes, confirm. Returns the confirmed photo. */
  async function addPhoto(as = token) {
    const upload = await reserve(as);
    expect((await put(upload)).status).toBe(200);
    const res = await authed(http().post(`/v1/me/photos/${upload.photo.id}/complete`), as)
      .send({ width: 1080, height: 1350 })
      .expect(200);
    return res.body as { id: string; position: number; status: string; url: string };
  }

  beforeAll(async () => {
    ctx = await createIntegrationApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    token = await signInAs(ctx, 'anaya@example.com');
  });

  it('uploads through a presigned URL, confirms, and serves it back privately', async () => {
    const upload = await reserve();
    expect(upload.photo).toMatchObject({ position: 1, status: 'uploading', url: null });
    expect(upload.upload).toMatchObject({
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
    });

    expect((await put(upload)).status).toBe(200);
    const done = await authed(http().post(`/v1/me/photos/${upload.photo.id}/complete`))
      .send({ width: 1080, height: 1350 })
      .expect(200);
    // Local moderation auto-approves.
    expect(done.body).toMatchObject({ id: upload.photo.id, status: 'approved', width: 1080 });

    const download = await fetch(done.body.url);
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer()).equals(JPEG)).toBe(true);

    // The object itself is private.
    const bare = new URL(done.body.url);
    expect((await fetch(`${bare.origin}${bare.pathname}`)).status).toBe(403);

    // Confirming again is harmless.
    await authed(http().post(`/v1/me/photos/${upload.photo.id}/complete`))
      .send({ width: 1080, height: 1350 })
      .expect(200);
  });

  it('refuses to confirm before the bytes arrive', async () => {
    const upload = await reserve();
    const res = await authed(http().post(`/v1/me/photos/${upload.photo.id}/complete`))
      .send({ width: 1080, height: 1350 })
      .expect(409);
    expect(res.body.code).toBe('PHOTO_UPLOAD_MISSING');
  });

  it('rejects a file that is not really an image and deletes it', async () => {
    const upload = await reserve();
    expect((await put(upload, '<svg onload="alert(1)"></svg>')).status).toBe(200);
    const res = await authed(http().post(`/v1/me/photos/${upload.photo.id}/complete`))
      .send({ width: 1080, height: 1350 })
      .expect(422);
    expect(res.body.code).toBe('PHOTO_INVALID_IMAGE');
    const list = await authed(http().get('/v1/me/photos')).expect(200);
    expect(list.body.items).toEqual([]);
  });

  it('the upload URL only accepts the declared content type', async () => {
    const upload = await reserve();
    const res = await put(upload, JPEG, { 'Content-Type': 'text/html' });
    expect(res.status).toBe(403);
  });

  it('allows at most 6 photos', async () => {
    for (let i = 0; i < 6; i += 1) await reserve();
    const res = await authed(http().post('/v1/me/photos'))
      .send({ contentType: 'image/jpeg', byteSize: JPEG.length })
      .expect(409);
    expect(res.body.code).toBe('PHOTO_LIMIT_REACHED');
  });

  it('releases a slot whose upload was abandoned', async () => {
    for (let i = 0; i < 6; i += 1) await reserve();
    await ctx.db.query(
      "UPDATE profile_photos SET created_at = now() - interval '1 hour' WHERE position = 2",
    );
    const upload = await reserve();
    expect(upload.photo.position).toBe(6);
    const rows = await ctx.db.query('SELECT position FROM profile_photos ORDER BY position');
    expect(rows.rows.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('reorders photos and keeps positions 1..n', async () => {
    const a = await addPhoto();
    const b = await addPhoto();
    const c = await addPhoto();
    const res = await authed(http().patch('/v1/me/photos/order'))
      .send({ photoIds: [c.id, a.id, b.id] })
      .expect(200);
    expect(res.body.items.map((p: { id: string; position: number }) => [p.id, p.position])).toEqual(
      [
        [c.id, 1],
        [a.id, 2],
        [b.id, 3],
      ],
    );

    const missing = await authed(http().patch('/v1/me/photos/order'))
      .send({ photoIds: [c.id, a.id] })
      .expect(400);
    expect(missing.body.code).toBe('VALIDATION_FAILED');
  });

  it('removing a photo closes the gap; a finished profile keeps at least 4', async () => {
    const photos = [];
    for (let i = 0; i < 5; i += 1) photos.push(await addPhoto());

    await authed(http().delete(`/v1/me/photos/${photos[0].id}`)).expect(204);
    const list = await authed(http().get('/v1/me/photos')).expect(200);
    expect(list.body.items.map((p: { position: number }) => p.position)).toEqual([1, 2, 3, 4]);
    expect(list.body.items[0].id).toBe(photos[1].id);

    // Once onboarding is finished the account is active and can't drop below 4.
    await ctx.db.query("UPDATE users SET status = 'active'");
    const res = await authed(http().delete(`/v1/me/photos/${photos[1].id}`)).expect(409);
    expect(res.body.code).toBe('PHOTO_MINIMUM');
  });

  it('counts 4 uploaded photos as the photos step done', async () => {
    for (let i = 0; i < 3; i += 1) await addPhoto();
    let profile = await authed(http().get('/v1/me/profile')).expect(200);
    expect(profile.body.onboarding.missing).toContain('photos');
    expect(profile.body.photos).toHaveLength(3);

    await addPhoto();
    profile = await authed(http().get('/v1/me/profile')).expect(200);
    expect(profile.body.onboarding.missing).not.toContain('photos');
  });

  it('keeps photos private to their owner', async () => {
    const mine = await addPhoto();
    const other = await signInAs(ctx, 'kabir@example.com');
    await authed(http().post(`/v1/me/photos/${mine.id}/complete`), other)
      .send({ width: 1080, height: 1350 })
      .expect(404);
    await authed(http().delete(`/v1/me/photos/${mine.id}`), other).expect(404);
    const theirs = await authed(http().get('/v1/me/photos'), other).expect(200);
    expect(theirs.body.items).toEqual([]);
  });

  it('validates the reservation', async () => {
    for (const body of [
      { contentType: 'image/gif', byteSize: 100 },
      { contentType: 'image/jpeg', byteSize: 11 * 1024 * 1024 },
      { contentType: 'image/jpeg', byteSize: 0 },
    ]) {
      await authed(http().post('/v1/me/photos')).send(body).expect(400);
    }
  });
});
