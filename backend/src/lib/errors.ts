export abstract class DomainError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;
}

export class NotFoundError extends DomainError {
  readonly status = 404;
  readonly code = 'not_found';
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class InvalidStateError extends DomainError {
  readonly status = 409;
  readonly code = 'invalid_state';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStateError';
  }
}

export class UnauthorizedError extends DomainError {
  readonly status = 401;
  readonly code = 'unauthorized';
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class DockerUnavailableError extends DomainError {
  readonly status = 503;
  readonly code = 'docker_unavailable';
  constructor(message = 'Docker engine is not reachable') {
    super(message);
    this.name = 'DockerUnavailableError';
  }
}
