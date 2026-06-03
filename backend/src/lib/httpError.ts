export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'VALIDATION_ERROR'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'INTERNAL_ERROR';

export class HttpError extends Error {
  status: number;
  code: ErrorCode;
  expose: boolean;
  details?: unknown;

  constructor(status: number, message: string, code: ErrorCode, details?: unknown, expose = status < 500) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = expose;
  }
}

export function httpError(status: number, message: string, code?: ErrorCode, details?: unknown) {
  return new HttpError(status, message, code || statusToCode(status), details);
}

function statusToCode(status: number): ErrorCode {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  return 'INTERNAL_ERROR';
}
