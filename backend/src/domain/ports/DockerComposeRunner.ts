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
}
