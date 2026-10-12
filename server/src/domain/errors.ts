export type DomainErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ALREADY_RESOLVED'
  | 'IN_PROGRESS'
  | 'AI_NOT_CONFIGURED'
  | 'AI_UNAVAILABLE'
  | 'NOT_IMPLEMENTED';

const HTTP_STATUS: Record<DomainErrorCode, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ALREADY_RESOLVED: 409,
  IN_PROGRESS: 409,
  AI_NOT_CONFIGURED: 503,
  AI_UNAVAILABLE: 502,
  NOT_IMPLEMENTED: 501,
};

/** Erreur métier : son message est rédigé pour être montré tel quel à la propriétaire. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }
}
