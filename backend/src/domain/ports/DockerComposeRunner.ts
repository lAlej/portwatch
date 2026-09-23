export interface DockerComposeRunner {
  build(
    cwd: string,
    composeFile: string,
    projectName: string,
  ): AsyncIterable<{ line: string; stream: 'stdout' | 'stderr' }>;
  up(
    cwd: string,
    composeFile: string,
    projectName: string,
  ): AsyncIterable<{ line: string; stream: 'stdout' | 'stderr' }>;
  // `up` with `--force-recreate` so config changes (ports, env,
  // network_mode, depends_on, etc.) apply without rebuilding images.
  upForceRecreate(
    cwd: string,
    composeFile: string,
    projectName: string,
  ): AsyncIterable<{ line: string; stream: 'stdout' | 'stderr' }>;
}
