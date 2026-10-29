import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTmpDir, removeDir } from '../../testing/fakes.js';

const spawnStream = vi.hoisted(() => vi.fn(async function* () {}));
vi.mock('./spawnStream.js', () => ({ spawnStream }));

import { HostDockerComposeRunner } from './HostDockerComposeRunner.js';

async function drain(iter: AsyncIterable<unknown>): Promise<void> {
  for await (const _ of iter) void _;
}

describe('HostDockerComposeRunner', () => {
  let cwd: string;
  const runner = new HostDockerComposeRunner();

  beforeEach(async () => {
    spawnStream.mockClear();
    cwd = await makeTmpDir();
  });
  afterEach(() => removeDir(cwd));

  const lastCall = () => {
    const [cmd, args, opts] = spawnStream.mock.calls.at(-1) as unknown as [
      string,
      string[],
      { cwd: string; env: NodeJS.ProcessEnv },
    ];
    return { cmd, args, opts };
  };

  it('build pulls base images and runs in the project directory', async () => {
    await drain(runner.build(cwd, 'docker-compose.yml', 'my-app'));
    const { cmd, args, opts } = lastCall();
    expect(cmd).toBe('docker');
    expect(args).toEqual(['compose', '-f', 'docker-compose.yml', '-p', 'my-app', 'build', '--pull']);
    expect(opts.cwd).toBe(cwd);
  });

  it('up detaches and removes orphans', async () => {
    await drain(runner.up(cwd, 'compose.yml', 'my-app'));
    expect(lastCall().args).toEqual([
      'compose', '-f', 'compose.yml', '-p', 'my-app', 'up', '-d', '--remove-orphans',
    ]);
  });

  it('upForceRecreate adds --force-recreate', async () => {
    await drain(runner.upForceRecreate(cwd, 'compose.yml', 'my-app'));
    expect(lastCall().args).toEqual([
      'compose', '-f', 'compose.yml', '-p', 'my-app', 'up', '-d', '--force-recreate', '--remove-orphans',
    ]);
  });

  it('passes --env-file only when a .env exists (compose aborts on a missing one)', async () => {
    await drain(runner.up(cwd, 'compose.yml', 'my-app'));
    expect(lastCall().args).not.toContain('--env-file');

    await fs.writeFile(join(cwd, '.env'), 'A=1\n', 'utf8');
    await drain(runner.up(cwd, 'compose.yml', 'my-app'));
    expect(lastCall().args).toEqual(expect.arrayContaining(['--env-file', '.env']));

    await drain(runner.upForceRecreate(cwd, 'compose.yml', 'my-app'));
    expect(lastCall().args).toEqual(expect.arrayContaining(['--env-file', '.env']));
  });

  it('runs compose non-interactively with colour disabled', async () => {
    await drain(runner.build(cwd, 'compose.yml', 'my-app'));
    expect(lastCall().opts.env).toMatchObject({ CI: '1', NO_COLOR: '1', FORCE_COLOR: '0' });
  });

  it('keeps hostile project names as a single argument', async () => {
    await drain(runner.up(cwd, 'compose.yml', 'x; rm -rf /'));
    const { args } = lastCall();
    expect(args[args.indexOf('-p') + 1]).toBe('x; rm -rf /');
  });
});
