import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { DockerComposeRunner } from '../../domain/ports/DockerComposeRunner.js';
import { spawnStream, type Line } from './spawnStream.js';

const COMPOSE_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  LC_ALL: 'C.UTF-8',
  NO_COLOR: '1',
  FORCE_COLOR: '0',
  CI: '1',
};

// docker compose aborts with `couldn't find env file` if --env-file .env
// points at a missing file. Projects without env vars (ad-hoc, or cloned
// repos with no .env) never write .env to disk.
async function envFlagIfPresent(cwd: string): Promise<string[]> {
  try {
    await fs.access(join(cwd, '.env'));
    return ['--env-file', '.env'];
  } catch {
    return [];
  }
}

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
    return (async function* (): AsyncIterable<Line> {
      const envFlag = await envFlagIfPresent(cwd);
      const proc = spawnStream(
        'docker',
        ['compose', '-f', composeFile, '-p', projectName, ...envFlag, 'up', '-d', '--remove-orphans'],
        { cwd, env: COMPOSE_ENV },
      );
      for await (const line of proc) yield line;
    })();
  }

  upForceRecreate(
    cwd: string,
    composeFile: string,
    projectName: string,
  ): AsyncIterable<Line> {
    return (async function* (): AsyncIterable<Line> {
      const envFlag = await envFlagIfPresent(cwd);
      const proc = spawnStream(
        'docker',
        [
          'compose',
          '-f',
          composeFile,
          '-p',
          projectName,
          ...envFlag,
          'up',
          '-d',
          '--force-recreate',
          '--remove-orphans',
        ],
        { cwd, env: COMPOSE_ENV },
      );
      for await (const line of proc) yield line;
    })();
  }
}