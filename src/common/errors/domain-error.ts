import { ErrorCode } from './error-codes';

export interface FieldError {
  /** Dotted path of the offending field, e.g. "profile.height". */
  path: string;
  message: string;
}

export interface DomainErrorOptions {
  status?: number;
  errors?: FieldError[];
  /** Extra response headers, e.g. Retry-After. */
  headers?: Record<string, string>;
}

/**
 * Error thrown by services for expected failures (bad input, missing resource, rule violated).
 * The global filter turns it into an RFC 7807 problem+json response.
 */
export class DomainError extends Error {
  readonly status: number;
  readonly errors?: FieldError[];
  readonly headers?: Record<string, string>;

  constructor(
    readonly code: string,
    message: string,
    options: DomainErrorOptions = {},
  ) {
    super(message);
    this.name = 'DomainError';
    this.status = options.status ?? 400;
    this.errors = options.errors;
    this.headers = options.headers;
  }
}

export class NotFoundError extends DomainError {
  constructor(message = 'Resource not found') {
    super(ErrorCode.NOT_FOUND, message, { status: 404 });
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Please sign in to continue.') {
    super(ErrorCode.UNAUTHORIZED, message, {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer' },
    });
    this.name = 'UnauthorizedError';
  }
}

export class AppUpdateRequiredError extends DomainError {
  constructor(minVersion: string) {
    super(
      ErrorCode.APP_UPDATE_REQUIRED,
      `Please update the app to version ${minVersion} or newer.`,
      { status: 426 },
    );
    this.name = 'AppUpdateRequiredError';
  }
}
