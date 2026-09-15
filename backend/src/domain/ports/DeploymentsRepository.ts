import type { Deployment } from '../entities/Deployment.js';

export interface DeploymentsRepository {
  append(d: Deployment): Promise<void>;
  update(d: Deployment): Promise<void>;
  getByProject(projectId: string, limit?: number): Promise<Deployment[]>;
}
