export type DeploymentStatus =
  | 'queued'
  | 'pulling'
  | 'building'
  | 'starting'
  | 'success'
  | 'failed'
  | 'cancelled';

export interface Deployment {
  id: string;
  projectId: string;
  status: DeploymentStatus;
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  error?: string;
}
