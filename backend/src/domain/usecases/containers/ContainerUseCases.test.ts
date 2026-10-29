import { describe, expect, it, vi } from 'vitest';
import { InvalidStateError, NotFoundError } from '../../../lib/errors.js';
import { fakeLogger, InMemoryProjectsRepository, makeProject } from '../../../testing/fakes.js';
import type { ContainerRepository } from '../../ports/ContainerRepository.js';
import { GetProjectForContainer } from './GetProjectForContainer.js';
import { InspectContainer } from './InspectContainer.js';
import { KillContainer } from './KillContainer.js';
import { ListContainers } from './ListContainers.js';
import { PauseContainer } from './PauseContainer.js';
import { RestartContainer } from './RestartContainer.js';
import { StartContainer } from './StartContainer.js';
import { UnpauseContainer } from './UnpauseContainer.js';

function fakeRepo(overrides: Partial<ContainerRepository> = {}): ContainerRepository {
  return {
    list: vi.fn(async () => []),
    start: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    unpause: vi.fn(async () => undefined),
    restart: vi.fn(async () => undefined),
    kill: vi.fn(async () => undefined),
    inspect: vi.fn(async () => ({})),
    ...overrides,
  };
}

describe.each([
  ['start', StartContainer],
  ['pause', PauseContainer],
  ['unpause', UnpauseContainer],
  ['restart', RestartContainer],
  ['kill', KillContainer],
] as const)('%s container use case', (action, UseCase) => {
  it('delegates to the repository and logs the action', async () => {
    const repo = fakeRepo();
    const logger = fakeLogger();

    await new UseCase({ containerRepo: repo, logger }).execute('abc123');

    expect(repo[action]).toHaveBeenCalledTimes(1);
    expect(repo[action]).toHaveBeenCalledWith('abc123');
    expect(logger.info).toHaveBeenCalledWith(expect.any(String), { id: 'abc123' });
  });

  it('propagates repository errors untouched and does not log success', async () => {
    const repo = fakeRepo({
      [action]: vi.fn(async () => Promise.reject(new InvalidStateError('already paused'))),
    });
    const logger = fakeLogger();

    await expect(new UseCase({ containerRepo: repo, logger }).execute('abc123')).rejects.toThrow(
      'already paused',
    );
    expect(logger.info).not.toHaveBeenCalled();
  });
});

describe('ListContainers / InspectContainer', () => {
  it('returns what the repository lists', async () => {
    const repo = fakeRepo({ list: vi.fn(async () => [{ id: 'a' }] as never) });
    await expect(new ListContainers(repo).execute()).resolves.toEqual([{ id: 'a' }]);
  });

  it('inspects by id', async () => {
    const repo = fakeRepo({ inspect: vi.fn(async () => ({ Id: 'a' })) });
    await expect(new InspectContainer(repo).execute('a')).resolves.toEqual({ Id: 'a' });
  });
});

describe('GetProjectForContainer', () => {
  const inspectWithProject = (project: string | undefined) =>
    vi.fn(async () => ({
      Config: { Labels: project ? { 'com.docker.compose.project': project } : {} },
    }));

  function build(
    inspect: ContainerRepository['inspect'],
    projects = [makeProject({ id: 'p1', name: 'My App' })],
  ) {
    return new GetProjectForContainer({
      containers: fakeRepo({ inspect }),
      projects: new InMemoryProjectsRepository(projects),
    });
  }

  it('resolves the registered project whose sanitized name matches the compose label', async () => {
    await expect(build(inspectWithProject('my-app')).execute({ id: 'c1' })).resolves.toEqual({
      projectId: 'p1',
    });
  });

  it('returns null for containers without a compose project label', async () => {
    await expect(build(inspectWithProject(undefined)).execute({ id: 'c1' })).resolves.toEqual({
      projectId: null,
    });
  });

  it('returns null when no registered project matches the label', async () => {
    await expect(build(inspectWithProject('unknown')).execute({ id: 'c1' })).resolves.toEqual({
      projectId: null,
    });
  });

  it('tolerates null labels from the Docker API', async () => {
    const inspect = vi.fn(async () => ({ Config: { Labels: null } }));
    await expect(build(inspect).execute({ id: 'c1' })).resolves.toEqual({ projectId: null });
  });

  it('returns null when the container has disappeared', async () => {
    const inspect = vi.fn(async () => Promise.reject(new NotFoundError('gone')));
    await expect(build(inspect).execute({ id: 'c1' })).resolves.toEqual({ projectId: null });
  });

  it('rethrows unexpected inspect errors', async () => {
    const inspect = vi.fn(async () => Promise.reject(new Error('docker down')));
    await expect(build(inspect).execute({ id: 'c1' })).rejects.toThrow('docker down');
  });
});
