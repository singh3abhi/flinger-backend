import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, TEST_CONFIG, type FakeInfraState } from './helpers/create-test-app';

describe('HTTP layer (e2e, in-memory Postgres/Redis fakes)', () => {
  let app: INestApplication;
  let infra: FakeInfraState;

  beforeAll(async () => {
    ({ app, infra } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    infra.dbHealthy = true;
    infra.redisHealthy = true;
  });

  describe('probes', () => {
    it('GET /health answers while the process is up', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('GET /ready reports Postgres and Redis as up', async () => {
      const res = await request(app.getHttpServer()).get('/ready').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.info.database.status).toBe('up');
      expect(res.body.info.redis.status).toBe('up');
    });

    it('GET /ready is 503 problem+json with the failing check when Postgres is down', async () => {
      infra.dbHealthy = false;
      const res = await request(app.getHttpServer()).get('/ready').expect(503);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
      expect(res.body.checks.database.status).toBe('down');
      expect(res.body.checks.redis.status).toBe('up');
    });

    it('GET /ready is 503 when Redis is down', async () => {
      infra.redisHealthy = false;
      const res = await request(app.getHttpServer()).get('/ready').expect(503);
      expect(res.body.checks.redis.status).toBe('down');
    });
  });

  describe('GET /v1/config', () => {
    it('publishes the minimum app version and product limits', async () => {
      const res = await request(app.getHttpServer()).get('/v1/config').expect(200);
      expect(res.body.minSupportedAppVersion).toBe(TEST_CONFIG.MIN_APP_VERSION);
      expect(res.body.flags).toEqual({});
      expect(res.body.limits).toMatchObject({
        photosMin: 4,
        photosMax: 6,
        promptsRequired: 3,
        dailyLikes: 25,
        minAge: 18,
      });
    });

    it('is not reachable without the /v1 prefix', async () => {
      await request(app.getHttpServer()).get('/config').expect(404);
    });
  });

  describe('errors', () => {
    it('unknown routes are problem+json with a stable code', async () => {
      const res = await request(app.getHttpServer()).get('/v1/nope').expect(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body).toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
        type: 'https://api.flinger.app/errors/not-found',
      });
    });

    it('echoes a well-formed x-request-id and includes it in error bodies', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/nope')
        .set('x-request-id', 'req-12345678')
        .expect(404);
      expect(res.headers['x-request-id']).toBe('req-12345678');
      expect(res.body.requestId).toBe('req-12345678');
    });

    it('replaces a malformed x-request-id with a generated one', async () => {
      const res = await request(app.getHttpServer())
        .get('/health')
        .set('x-request-id', 'bad id with spaces!')
        .expect(200);
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('security headers and OpenAPI', () => {
    it('sets helmet headers', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('serves an OpenAPI document generated from the Zod schemas', async () => {
      const res = await request(app.getHttpServer()).get('/docs/openapi.json').expect(200);
      expect(res.body.openapi).toMatch(/^3\./);
      expect(res.body.info.title).toBe('Flinger API');
      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining(['/health', '/ready', '/v1/config']),
      );
      expect(res.body.components.schemas.ClientConfigDto.properties.limits).toBeDefined();
    });
  });
});
