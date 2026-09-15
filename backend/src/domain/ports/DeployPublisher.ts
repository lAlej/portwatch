import type { DeployEvent } from './DeployRunner.js';

export interface DeployPublisher {
  publish(deploymentId: string, event: DeployEvent): void;
}
