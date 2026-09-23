import type { DeployEvent } from './DeployRunner.js';

export interface DeployPublisher {
  publish(deploymentId: string, event: DeployEvent): void;
  // Broadcasts a system-wide "containers may have changed" signal so the
  // frontend can re-fetch the container list after deploys / edit compose.
  notifyContainersChanged(): void;
}
