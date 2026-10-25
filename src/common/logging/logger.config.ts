import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { AppConfig } from '@/config/config.module';

const REQUEST_ID_PATTERN = /^[\w-]{8,64}$/;
const QUIET_PATHS = new Set(['/health', '/ready']);

/**
 * pino logging: JSON everywhere, pretty only on a developer laptop.
 * Never log secrets: auth headers and cookies are redacted. OTPs, tokens, phone numbers and
 * message bodies must never be passed to the logger at all (see docs/02-architecture.md 5.5).
 */
export function buildLoggerParams(config: AppConfig): Params {
  const pretty = config.APP_ENV === 'local' && config.NODE_ENV === 'development';
  return {
    pinoHttp: {
      level: config.LOG_LEVEL,
      base: {
        service: 'flinger-backend',
        mode: config.APP_MODE,
        env: config.APP_ENV,
        version: config.APP_VERSION,
      },
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
            ? incoming
            : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        censor: '[redacted]',
      },
      autoLogging: { ignore: (req: IncomingMessage) => QUIET_PATHS.has(req.url ?? '') },
      ...(pretty
        ? { transport: { target: 'pino-pretty', options: { singleLine: true, colorize: true } } }
        : {}),
    },
  };
}
