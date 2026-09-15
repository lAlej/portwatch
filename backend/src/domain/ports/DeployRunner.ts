import type { Project } from '../entities/Project.js';
import type { Deployment, DeploymentStatus } from '../entities/Deployment.js';

export type DeployEvent =
  | { kind: 'log'; line: string; stream: 'stdout' | 'stderr' }
  | { kind: 'status'; status: DeploymentStatus }
  | { kind: 'exit'; exitCode: number; error?: string };

export interface DeployRunner {
  run(project: Project, deployment: Deployment): AsyncIterable<DeployEvent>;
  cancel(deploymentId: string): Promise<void>;
}
