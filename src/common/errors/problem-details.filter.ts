import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import type { ZodError } from 'zod';
import { DomainError, type FieldError } from './domain-error';
import { ErrorCode } from './error-codes';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  requestId?: string;
  errors?: FieldError[];
  /** Readiness checks, only on 503 from /ready. */
  checks?: unknown;
}

const TITLES: Record<number, string> = {
  400: 'Bad request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  422: 'Unprocessable request',
  426: 'Update required',
  429: 'Too many requests',
  500: 'Internal server error',
  503: 'Service unavailable',
};

function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return ErrorCode.VALIDATION_FAILED;
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 426:
      return ErrorCode.APP_UPDATE_REQUIRED;
    case 429:
      return ErrorCode.RATE_LIMITED;
    case 503:
      return ErrorCode.SERVICE_UNAVAILABLE;
    default:
      return status >= 500 ? ErrorCode.INTERNAL_ERROR : `HTTP_${status}`;
  }
}

function problemType(code: string): string {
  return `https://api.flinger.app/errors/${code.toLowerCase().replace(/_/g, '-')}`;
}

function fromZod(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

/**
 * One filter for the whole API. Every error leaves as application/problem+json (RFC 7807)
 * with a stable `code`. Unknown errors are logged with their stack and returned as a generic 500:
 * internals never leak to clients.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { id?: string }>();

    const problem = this.toProblem(exception, request);

    if (problem.status >= 500) {
      this.logger.error(
        { err: exception, requestId: problem.requestId },
        `${request.method} ${request.url} failed`,
      );
    }

    if (exception instanceof DomainError && exception.headers) {
      for (const [name, value] of Object.entries(exception.headers))
        response.setHeader(name, value);
    }

    response.status(problem.status).type('application/problem+json').send(problem);
  }

  private toProblem(exception: unknown, request: Request & { id?: string }): ProblemDetails {
    const requestId =
      (request.id !== undefined ? String(request.id) : undefined) ??
      (typeof request.headers['x-request-id'] === 'string'
        ? request.headers['x-request-id']
        : undefined);

    if (exception instanceof DomainError) {
      return this.build(exception.status, exception.code, exception.message, requestId, {
        errors: exception.errors,
      });
    }

    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError() as ZodError;
      return this.build(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_FAILED,
        'The request is invalid.',
        requestId,
        { errors: fromZod(zodError) },
      );
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const detail =
        typeof body === 'string'
          ? body
          : typeof (body as { message?: unknown }).message === 'string'
            ? (body as { message: string }).message
            : exception.message;
      const checks =
        status === HttpStatus.SERVICE_UNAVAILABLE && typeof body === 'object'
          ? (body as { details?: unknown }).details
          : undefined;
      return this.build(
        status,
        codeForStatus(status),
        checks !== undefined ? 'One or more dependencies are unavailable.' : detail,
        requestId,
        { checks },
      );
    }

    return this.build(
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCode.INTERNAL_ERROR,
      'Something went wrong. Please try again.',
      requestId,
    );
  }

  private build(
    status: number,
    code: string,
    detail: string,
    requestId?: string,
    extra: { errors?: FieldError[]; checks?: unknown } = {},
  ): ProblemDetails {
    return {
      type: problemType(code),
      title: TITLES[status] ?? (status >= 500 ? TITLES[500] : TITLES[400]),
      status,
      code,
      detail,
      ...(requestId ? { requestId } : {}),
      ...(extra.errors?.length ? { errors: extra.errors } : {}),
      ...(extra.checks !== undefined ? { checks: extra.checks } : {}),
    };
  }
}
