import type { Server as IoServer } from 'socket.io';
import type { DeployPublisher } from '../../domain/ports/DeployPublisher.js';
import type { DeployEvent } from '../../domain/ports/DeployRunner.js';

export class SocketIoDeployPublisher implements DeployPublisher {
  constructor(private readonly io: IoServer) {}

  publish(deploymentId: string, event: DeployEvent): void {
    this.io.to(`deploy:${deploymentId}`).emit(`deploy:${deploymentId}`, event);
  }
}
