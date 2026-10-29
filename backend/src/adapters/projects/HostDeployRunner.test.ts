import { describe, expect, it, vi } from 'vitest';
import type { Deployment } from '../../domain/entities/Deployment.js';
import type { DeployEvent } from '../../domain/ports/DeployRunner.js';
import { fakeCompose, fakeGit, fakeLogger, lines, makeProject } from '../../testing/fakes.js';
import { HostDeployRunner } from './HostDeployRunner.js';

const deployment: Deployment = {
  id: 'd1',
  projectId: 'p1',
  status: 'queued',
  startedAt: 0,
  finishedAt: null,
  exitCode: null,
};

async function collect(iter: AsyncIterable<DeployEvent>): Promise<DeployEvent[]> {
  const out: DeployEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

const statuses = (events: DeployEvent[]) =>
  events.flatMap((e) => (e.kind === 'status' ? [e.status] : []));
const logs = (events: DeployEvent[]) => events.flatMap((e) => (e.kind === 'log' ? [e.line] : []));

describe('HostDeployRunner', () => {
  it('pulls, builds and starts a cloned project, streaming every line', async () => {
    const git = fakeGit({ pull: vi.fn(() => lines([{ line: 'Already up to date.', stream: 'stdout' }])) });
    const compose = fakeCompose({
      build: vi.fn(() => lines([{ line: 'build step', stream: 'stdout' }])),
      up: vi.fn(() => lines([{ line: 'Container started', stream: 'stdout' }])),
    });
    const runner = new HostDeployRunner({ git, compose, logger: fakeLogger() });

    const events = await collect(runner.run(makeProject({ name: 'My App' }), deployment));

    expect(statuses(events)).toEqual(['pulling', 'building', 'starting']);
    expect(logs(events)).toEqual(['Already up to date.', 'build step', 'Container started']);
    expect(events.at(-1)).toEqual({ kind: 'exit', exitCode: 0 });
    expect(compose.build).toHaveBeenCalledWith('/projects/my-app', 'docker-compose.yml', 'my-app');
    expect(compose.up).toHaveBeenCalledWith('/projects/my-app', 'docker-compose.yml', 'my-app');
  });

  it('skips git and build for ad-hoc projects and goes straight to up', async () => {
    const git = fakeGit();
    const compose = fakeCompose();
    const runner = new HostDeployRunner({ git, compose, logger: fakeLogger() });

    const events = await collect(runner.run(makeProject({ cloneUrl: '' }), deployment));

    expect(git.pull).not.toHaveBeenCalled();
    expect(compose.build).not.toHaveBeenCalled();
    expect(compose.up).toHaveBeenCalledTimes(1);
    expect(logs(events)).toEqual([
      'Ad-hoc project (no git): skipping git pull.',
      'Ad-hoc project (no source): skipping docker compose build.',
    ]);
    expect(events.at(-1)).toEqual({ kind: 'exit', exitCode: 0 });
  });

  it('continues to build when git pull fails, surfacing a warning', async () => {
    const git = fakeGit({ pull: vi.fn(() => lines([], new Error('not a fast-forward'))) });
    const compose = fakeCompose();
    const logger = fakeLogger();
    const runner = new HostDeployRunner({ git, compose, logger });

    const events = await collect(runner.run(makeProject(), deployment));

    expect(logs(events)).toContain('warn: not a fast-forward');
    expect(compose.build).toHaveBeenCalled();
    expect(events.at(-1)).toEqual({ kind: 'exit', exitCode: 0 });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('stops with exit 1 when the build fails and never runs up', async () => {
    const compose = fakeCompose({ build: vi.fn(() => lines([], new Error('Dockerfile parse error'))) });
    const runner = new HostDeployRunner({ git: fakeGit(), compose, logger: fakeLogger() });

    const events = await collect(runner.run(makeProject(), deployment));

    expect(compose.up).not.toHaveBeenCalled();
    expect(logs(events)).toContain('error: Dockerfile parse error');
    expect(events.at(-1)).toEqual({ kind: 'exit', exitCode: 1, error: 'Dockerfile parse error' });
    expect(statuses(events)).not.toContain('starting');
  });

  it('reports exit 1 when up fails', async () => {
    const compose = fakeCompose({ up: vi.fn(() => lines([], new Error('port already allocated'))) });
    const runner = new HostDeployRunner({ git: fakeGit(), compose, logger: fakeLogger() });

    const events = await collect(runner.run(makeProject(), deployment));

    expect(statuses(events)).toEqual(['pulling', 'building', 'starting']);
    expect(events.at(-1)).toEqual({ kind: 'exit', exitCode: 1, error: 'port already allocated' });
  });

  it('succeeds with a note when the project has no compose file', async () => {
    const compose = fakeCompose();
    const runner = new HostDeployRunner({ git: fakeGit(), compose, logger: fakeLogger() });

    const events = await collect(runner.run(makeProject({ composeFile: '' }), deployment));

    expect(logs(events)).toContain('No compose file; nothing to build/up.');
    expect(compose.build).not.toHaveBeenCalled();
    expect(compose.up).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({ kind: 'exit', exitCode: 0 });
  });

  it('cancel is a documented no-op', async () => {
    const runner = new HostDeployRunner({ git: fakeGit(), compose: fakeCompose(), logger: fakeLogger() });
    await expect(runner.cancel('d1')).resolves.toBeUndefined();
  });
});
