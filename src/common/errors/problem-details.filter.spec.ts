import { HttpException, Logger, NotFoundException, type ArgumentsHost } from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';
import { AppUpdateRequiredError, DomainError } from './domain-error';
import { ErrorCode } from './error-codes';
import { ProblemDetailsFilter } from './problem-details.filter';

function run(exception: unknown, request: Record<string, unknown> = {}) {
  const sent: {
    status?: number;
    type?: string;
    body?: Record<string, unknown>;
    headers: Record<string, string>;
  } = {
    headers: {},
  };
  const response = {
    setHeader: (name: string, value: string) => {
      sent.headers[name] = value;
    },
    status(code: number) {
      sent.status = code;
      return this;
    },
    type(value: string) {
      sent.type = value;
      return this;
    },
    send(body: Record<string, unknown>) {
      sent.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'GET', url: '/x', headers: {}, ...request }),
    }),
  } as unknown as ArgumentsHost;
  new ProblemDetailsFilter().catch(exception, host);
  return sent;
}

describe('ProblemDetailsFilter', () => {
  beforeEach(() => {
    // 5xx errors are logged on purpose; keep test output quiet.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps a DomainError to its status, code and field errors', () => {
    const sent = run(
      new DomainError('OTP_INVALID', 'The code is wrong.', {
        status: 400,
        errors: [{ path: 'code', message: 'Must be 6 digits' }],
      }),
      { id: 'abc12345' },
    );
    expect(sent.status).toBe(400);
    expect(sent.type).toBe('application/problem+json');
    expect(sent.body).toMatchObject({
      type: 'https://api.flinger.app/errors/otp-invalid',
      status: 400,
      code: 'OTP_INVALID',
      detail: 'The code is wrong.',
      requestId: 'abc12345',
      errors: [{ path: 'code', message: 'Must be 6 digits' }],
    });
  });

  it('sets custom headers such as Retry-After', () => {
    const sent = run(
      new DomainError(ErrorCode.RATE_LIMITED, 'Slow down', {
        status: 429,
        headers: { 'Retry-After': '30' },
      }),
    );
    expect(sent.status).toBe(429);
    expect(sent.headers['Retry-After']).toBe('30');
  });

  it('gives APP_UPDATE_REQUIRED a 426', () => {
    const sent = run(new AppUpdateRequiredError('1.4.0'));
    expect(sent.status).toBe(426);
    expect(sent.body?.code).toBe('APP_UPDATE_REQUIRED');
    expect(sent.body?.detail).toContain('1.4.0');
  });

  it('maps Nest HttpExceptions by status', () => {
    const sent = run(new NotFoundException('Cannot GET /x'));
    expect(sent.status).toBe(404);
    expect(sent.body).toMatchObject({ code: 'NOT_FOUND', title: 'Not found' });
  });

  it('keeps unknown 4xx statuses with an HTTP_<status> code', () => {
    const sent = run(new HttpException('teapot', 418));
    expect(sent.status).toBe(418);
    expect(sent.body?.code).toBe('HTTP_418');
  });

  it('turns Zod validation failures into VALIDATION_FAILED with field paths', () => {
    const parsed = z
      .object({ user: z.object({ age: z.number().min(18) }) })
      .safeParse({ user: { age: 12 } });
    if (parsed.success) throw new Error('expected failure');
    const sent = run(new ZodValidationException(parsed.error));
    expect(sent.status).toBe(400);
    expect(sent.body?.code).toBe('VALIDATION_FAILED');
    expect(sent.body?.errors).toEqual([{ path: 'user.age', message: expect.any(String) }]);
  });

  it('hides internals of unexpected errors behind a generic 500', () => {
    const sent = run(new Error('connection to db.internal:5432 refused, password=hunter2'));
    expect(sent.status).toBe(500);
    expect(sent.body?.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(sent.body)).not.toContain('hunter2');
    expect(JSON.stringify(sent.body)).not.toContain('db.internal');
  });
});
