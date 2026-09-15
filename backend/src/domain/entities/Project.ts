export interface EnvVar {
  key: string;
  value: string;
}

export interface Project {
  id: string;
  name: string;
  cloneUrl: string;
  path: string;
  composeFile: string;
  hasDockerfile: boolean;
  createdAt: number;
  envVars: EnvVar[];
}
