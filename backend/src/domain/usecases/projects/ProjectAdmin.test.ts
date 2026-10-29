// Small project use cases that only orchestrate ports: env, delete, list, compose.
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../../lib/errors.js';
import {
  InMemoryProjectsRepository,
  fakeGit,
  fakeLogger,
  makeProject,
} from '../../../testing/fakes.js';
import { DeleteProject } from './DeleteProject.js';
import { GetProjectCompose } from './GetProjectCompose.js';
import { ListDeployments } from './ListDeployments.js';
import { ListProjects } from './ListProjects.js';
import { UpdateProjectEnv } from './UpdateProjectEnv.js';

describe('UpdateProjectEnv', () => {
  it('writes the .env and persists the cleaned variables', async () => {
    const repo = new InMemoryProjectsRepository([makeProject()]);
    const git = fakeGit();

    await new UpdateProjectEnv({ repo, git }).execute({
      id: 'p1',
      envVars: [
        { key: 'A', value: '1' },
        { key: '', value: 'x' },
      ],
    });

    expect(git.writeEnvFile).toHaveBeenCalledWith('/projects/my-app', [{ key: 'A', value: '1' }]);
    expect((await repo.get('p1'))?.envVars).toEqual([{ key: 'A', value: '1' }]);
  });

  it('can clear every variable', async () => {
    const repo = new InMemoryProjectsRepository([makeProject({ envVars: [{ key: 'A', value: '1' }] })]);
    await new UpdateProjectEnv({ repo, git: fakeGit() }).execute({ id: 'p1', envVars: [] });
    expect((await repo.get('p1'))?.envVars).toEqual([]);
  });

  it('throws NotFoundError for an unknown project', async () => {
    const useCase = new UpdateProjectEnv({ repo: new InMemoryProjectsRepository(), git: fakeGit() });
    await expect(useCase.execute({ id: 'x', envVars: [] })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('DeleteProject', () => {
  it('unregisters the project and removes its directory', async () => {
    const repo = new InMemoryProjectsRepository([makeProject()]);
    const git = fakeGit();

    await new DeleteProject({ repo, git, logger: fakeLogger() }).execute({ id: 'p1' });

    expect(await repo.get('p1')).toBeNull();
    expect(git.removeDir).toHaveBeenCalledWith('/projects/my-app');
  });

  it('still succeeds, and warns, when the directory cannot be removed', async () => {
    const repo = new InMemoryProjectsRepository([makeProject()]);
    const git = fakeGit({ removeDir: vi.fn(async () => Promise.reject(new Error('EBUSY'))) });
    const logger = fakeLogger();

    await expect(new DeleteProject({ repo, git, logger }).execute({ id: 'p1' })).resolves.toBeUndefined();

    expect(await repo.get('p1')).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      'failed to remove project directory',
      expect.objectContaining({ error: 'EBUSY' }),
    );
  });

  it('throws NotFoundError and deletes nothing for an unknown project', async () => {
    const git = fakeGit();
    const useCase = new DeleteProject({
      repo: new InMemoryProjectsRepository(),
      git,
      logger: fakeLogger(),
    });
    await expect(useCase.execute({ id: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    expect(git.removeDir).not.toHaveBeenCalled();
  });
});

describe('ListProjects / ListDeployments / GetProjectCompose', () => {
  it('lists registered projects newest first', async () => {
    const repo = new InMemoryProjectsRepository([
      makeProject({ id: 'old', createdAt: 1 }),
      makeProject({ id: 'new', name: 'b', createdAt: 2 }),
    ]);
    const out = await new ListProjects(repo).execute();
    expect(out.projects.map((p) => p.id)).toEqual(['new', 'old']);
  });

  it('defaults the deployment history to 20 entries', async () => {
    const getByProject = vi.fn(async () => []);
    const useCase = new ListDeployments({ append: vi.fn(), update: vi.fn(), getByProject });
    await useCase.execute({ projectId: 'p1' });
    await useCase.execute({ projectId: 'p1', limit: 5 });
    expect(getByProject).toHaveBeenNthCalledWith(1, 'p1', 20);
    expect(getByProject).toHaveBeenNthCalledWith(2, 'p1', 5);
  });

  it('reads a project compose file, defaulting to the registered one', async () => {
    const repo = new InMemoryProjectsRepository([makeProject()]);
    await repo.writeComposeFile(makeProject(), 'services: {}');
    await expect(new GetProjectCompose({ repo }).execute({ id: 'p1' })).resolves.toEqual({
      relPath: 'docker-compose.yml',
      content: 'services: {}',
    });
  });

  it('throws NotFoundError when reading the compose of an unknown project', async () => {
    const useCase = new GetProjectCompose({ repo: new InMemoryProjectsRepository() });
    await expect(useCase.execute({ id: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
