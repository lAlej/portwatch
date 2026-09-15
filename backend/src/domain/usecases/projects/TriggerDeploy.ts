import type { DeployRunner } from '../../ports/DeployRunner.js';
import type { DeployPublisher } from '../../ports/DeployPublisher.js';
import type { DeploymentsRepository } from '../../ports/DeploymentsRepository.js';
import type { ProjectsRepository } from '../../ports/ProjectsRepository.js';
import type { Logger } from '../../ports/Logger.js';
import type { Deployment, DeploymentStatus } from '../../entities/Deployment.js';
import type { Project } from '../../entities/Project.js';
import { newDeploymentId } from '../../entities/deploymentId.js';
import { NotFoundError } from '../../../lib/errors.js';

export class TriggerDeploy {
  constructor(
    private readonly deps: {
      runner: DeployRunner;
      publisher: DeployPublisher;
      deployments: DeploymentsRepository;
      projects: ProjectsRepository;
      logger: Logger;
    },
  ) {}

  async execute(input: { id: string }): Promise<{ deploymentId: string }> {
    const project = await this.deps.projects.get(input.id);
    if (!project) throw new NotFoundError(`Project ${input.id} not found`);

    const deployment: Deployment = {
      id: newDeploymentId(),
      projectId: project.id,
      status: 'queued',
      startedAt: Date.now(),
      finishedAt: null,
      exitCode: null,
    };
    await this.deps.deployments.append(deployment);
    this.deps.publisher.publish(deployment.id, { kind: 'status', status: 'queued' });
    this.deps.logger.info('deploy queued', { deploymentId: deployment.id, project: project.name });

    // Fire-and-forget. The caller already received the id.
    void this.run(project, deployment);

    return { deploymentId: deployment.id };
  }

  private async run(
    project: Project,
    deployment: Deployment,
  ): Promise<void> {
    let current: Deployment = deployment;
    const updateStatus = async (status: DeploymentStatus): Promise<void> => {
      current = { ...current, status, finishedAt: status === 'success' || status === 'failed' || status === 'cancelled' ? Date.now() : current.finishedAt };
      await this.deps.deployments.update(current);
      this.deps.publisher.publish(current.id, { kind: 'status', status });
    };

    try {
      for await (const event of this.deps.runner.run(project, deployment)) {
        if (event.kind === 'status') {
          await updateStatus(event.status);
        } else if (event.kind === 'log') {
          this.deps.publisher.publish(current.id, event);
        } else if (event.kind === 'exit') {
          const finalStatus: DeploymentStatus =
            event.exitCode === 0 ? 'success' : event.error === 'cancelled' ? 'cancelled' : 'failed';
          current = {
            ...current,
            status: finalStatus,
            finishedAt: Date.now(),
            exitCode: event.exitCode,
            error: event.error,
          };
          await this.deps.deployments.update(current);
          this.deps.publisher.publish(current.id, { kind: 'status', status: finalStatus });
          this.deps.publisher.publish(current.id, {
            kind: 'exit',
            exitCode: event.exitCode,
            error: event.error,
          });
          this.deps.logger.info('deploy finished', {
            deploymentId: current.id,
            project: project.name,
            exitCode: event.exitCode,
            status: finalStatus,
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'deploy crashed';
      current = { ...current, status: 'failed', finishedAt: Date.now(), error: msg };
      await this.deps.deployments.update(current).catch(() => undefined);
      this.deps.publisher.publish(current.id, { kind: 'status', status: 'failed' });
      this.deps.publisher.publish(current.id, { kind: 'exit', exitCode: 1, error: msg });
      this.deps.logger.error('deploy crashed', { deploymentId: deployment.id, error: msg });
    }
  }
}
