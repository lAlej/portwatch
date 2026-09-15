import { randomUUID } from 'node:crypto';

export function newDeploymentId(): string {
  return randomUUID();
}
