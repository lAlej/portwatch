import type { DockerComposeRunner } from '../../domain/ports/DockerComposeRunner.js';
import { spawnStream, type Line } from './spawnStream.js';

const COMPOSE_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  LC_ALL: 'C.UTF-8',
  NO_COLOR: '1',
  FORCE_COLOR: '0',
  CI: '1',
};

export class HostDockerComposeRunner implements DockerComposeRunner {
  build(
    cwd: string,
    composeFile: string,
    projectName: string,
  ): AsyncIterable<Line> {
    return spawnStream(
      'docker',
      ['compose', '-f', composeFile, '-p', projectName, 'build', '--pull'],
      { cwd, env: COMPOSE_ENV },
    );
  }

  up(
    cwd: string,
    composeFile: string,
    projectName: string,
  ): AsyncIterable<Line> {
    return spawnStream(
      'docker',
      ['compose', '-f', composeFile, '-p', projectName, '--env-file', '.env', 'up', '-d', '--remove-orphans'],
      { cwd, env: COMPOSE_ENV },
    );
  }
}
