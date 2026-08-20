/**
 * The one error shape every route in the API uses — matches Doc 2, §5:
 * "errors as a consistent { code, message, details } shape." A route
 * throws one of these; the global error handler (plugins/error-handler.ts)
 * is the only place that shape is actually rendered onto the response.
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function unauthorized(message = 'Invalid credentials.'): HttpError {
  return new HttpError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'You do not have permission to do that.'): HttpError {
  return new HttpError(403, 'FORBIDDEN', message);
}

export function locked(message: string, details?: unknown): HttpError {
  return new HttpError(423, 'LOCKED', message, details);
}

export function notFound(message = 'Not found.'): HttpError {
  return new HttpError(404, 'NOT_FOUND', message);
}
