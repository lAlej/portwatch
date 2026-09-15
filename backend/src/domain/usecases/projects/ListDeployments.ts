import type { DeploymentsRepository } from '../../ports/DeploymentsRepository.js';
import type { Deployment } from '../../entities/Deployment.js';

export class ListDeployments {
  constructor(private readonly repo: DeploymentsRepository) {}

  async execute(input: { projectId: string; limit?: number }): Promise<{ deployments: Deployment[] }> {
    const deployments = await this.repo.getByProject(input.projectId, input.limit ?? 20);
    return { deployments };
  }
}
