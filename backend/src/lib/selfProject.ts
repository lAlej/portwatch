import { InvalidStateError } from './errors.js';

// Compose project name of this dashboard's own stack (the directory name the
// repo is cloned into, or `docker compose -p`). Containers in it are hidden
// from the UI and the project must never be redeployed from within itself.
export const SELF_COMPOSE_PROJECT = 'portwatch';

export function isSelfProject(name: string): boolean {
  return name === SELF_COMPOSE_PROJECT;
}

// `docker compose up` against our own stack would recreate the backend
// mid-deploy and kill the process that is running it.
export function assertNotSelfProject(name: string): void {
  if (isSelfProject(name)) {
    throw new InvalidStateError(
      `"${name}" is this dashboard's own compose project. Update it from the host shell instead.`,
    );
  }
}
