export type ContainerState =
  | 'running'
  | 'paused'
  | 'restarting'
  | 'exited'
  | 'created'
  | 'dead'
  | 'removing'
  | 'unknown';

export interface Container {
  id: string;
  name: string;
  image: string;
  state: ContainerState;
  status: string;
  created: number;
  ports: ContainerPort[];
  uptimeSeconds: number | null;
  labels: Record<string, string>;
}

export interface ContainerPort {
  privatePort: number;
  publicPort: number | null;
  type: string;
  ip: string | null;
}
