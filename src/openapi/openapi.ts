import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

/**
 * Build the OpenAPI document from the Zod schemas that validate requests. This document is the
 * contract the mobile and web clients generate their code from (docs/04-api-and-contracts.md).
 */
/** Version of the API contract (not the build). Bump when releasing a contract change. */
export const API_CONTRACT_VERSION = '0.1.0';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Flinger API')
    .setDescription(
      'REST API for the Flinger dating app. All errors are RFC 7807 problem+json with a stable `code`.',
    )
    .setVersion(API_CONTRACT_VERSION)
    .addBearerAuth()
    .build();
  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}

/** Serve interactive docs at /docs and the raw spec at /docs/openapi.json (not in production). */
export function setupOpenApi(app: INestApplication): void {
  SwaggerModule.setup('docs', app, buildOpenApiDocument(app), {
    jsonDocumentUrl: 'docs/openapi.json',
  });
}
