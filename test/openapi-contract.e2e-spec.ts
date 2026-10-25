import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildOpenApiDocument } from '@/openapi/openapi';
import { createTestApp } from './helpers/create-test-app';

/**
 * The OpenAPI document is the contract mobile and web generate their code from
 * (docs/04-api-and-contracts.md). It is committed at openapi/openapi.json so API changes are
 * visible in pull requests. This test fails when the committed file is stale.
 *
 *   pnpm openapi:build    regenerate and commit after changing an endpoint or DTO
 */
const CONTRACT_FILE = path.resolve(__dirname, '../openapi/openapi.json');

describe('OpenAPI contract', () => {
  it('matches the committed openapi/openapi.json', async () => {
    const { app } = await createTestApp();
    try {
      const generated = `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`;

      if (process.env.UPDATE_OPENAPI) {
        mkdirSync(path.dirname(CONTRACT_FILE), { recursive: true });
        writeFileSync(CONTRACT_FILE, generated);
        return;
      }

      let committed = '';
      try {
        committed = readFileSync(CONTRACT_FILE, 'utf8');
      } catch {
        throw new Error('openapi/openapi.json is missing. Run `pnpm openapi:build` and commit it.');
      }
      if (committed !== generated) {
        throw new Error(
          'openapi/openapi.json is out of date. Run `pnpm openapi:build`, review the diff for ' +
            'breaking changes, and commit it.',
        );
      }
    } finally {
      await app.close();
    }
  });

  /**
   * nestjs-zod emits a bare `z.string().nullable()` as `type: ["string","null"]`, which
   * @nestjs/swagger then publishes as an *array of strings*. Give nullable strings a constraint
   * (e.g. `.max(n)`) so they go through `anyOf`. This guard catches the mistake: a property that
   * is an array of bare, unconstrained strings.
   */
  it('has no nullable strings mangled into arrays', () => {
    const doc = JSON.parse(readFileSync(CONTRACT_FILE, 'utf8')) as {
      components: { schemas: Record<string, unknown> };
    };
    const offenders: string[] = [];
    const walk = (node: unknown, where: string): void => {
      if (!node || typeof node !== 'object') return;
      const schema = node as Record<string, unknown>;
      const items = schema.items as Record<string, unknown> | undefined;
      if (schema.type === 'array' && items && Object.keys(items).join() === 'type') {
        if (items.type === 'string') offenders.push(where);
      }
      for (const [key, child] of Object.entries(schema)) walk(child, `${where}.${key}`);
    };
    walk(doc.components.schemas, 'schemas');
    expect(offenders).toEqual([]);
  });
});
