import { describe, expect, it, vi } from 'vitest';
import { InvalidStateError } from '../../../lib/errors.js';
import {
  InMemoryProjectsRepository,
  fakeGit,
  fakeLogger,
  makeProject,
} from '../../../testing/fakes.js';
import type { Git } from '../../ports/Git.js';
import { CloneProject } from './CloneProject.js';

function setup(git: Git = fakeGit(), existing = [] as ReturnType<typeof makeProject>[]) {
  const repo = new InMemoryProjectsRepository(existing);
  const useCase = new CloneProject({
    repo,
    git,
    logger: fakeLogger(),
    projectsDir: '/projects',
  });
  return { useCase, repo, git };
}

describe('CloneProject', () => {
  it('clones into <projectsDir>/<name> and registers the project', async () => {
    const { useCase, repo, git } = setup();

    const { project } = await useCase.execute({
      cloneUrl: 'https://github.com/me/Cool_App.git',
    });

    expect(git.clone).toHaveBeenCalledWith(
      'https://github.com/me/Cool_App.git',
      '/projects/cool_app',
    );
    expect(project).toMatchObject({
      name: 'cool_app',
      cloneUrl: 'https://github.com/me/Cool_App.git',
      path: '/projects/cool_app',
      composeFile: 'docker-compose.yml',
      hasDockerfile: false,
      envVars: [],
    });
    expect(await repo.get(project.id)).toEqual(project);
  });

  it('derives the name from an scp-style ssh url', async () => {
    const { useCase } = setup();
    const { project } = await useCase.execute({ cloneUrl: 'git@github.com:me/yt-downloader.git' });
    expect(project.name).toBe('yt-downloader');
  });

  it('trims the url before using it', async () => {
    const { useCase, git } = setup();
    await useCase.execute({ cloneUrl: '  https://example.com/a/b.git \n' });
    expect(git.clone).toHaveBeenCalledWith('https://example.com/a/b.git', '/projects/b');
  });

  it('rejects an empty url and a url with no usable name', async () => {
    const { useCase } = setup();
    await expect(useCase.execute({ cloneUrl: '   ' })).rejects.toThrow(/cloneUrl is required/);
    await expect(useCase.execute({ cloneUrl: 'https://example.com/' })).rejects.toThrow(
      /Cannot derive project name/,
    );
  });

  it('rejects a duplicate name before cloning anything', async () => {
    const { useCase, git } = setup(fakeGit(), [makeProject({ name: 'b' })]);
    await expect(useCase.execute({ cloneUrl: 'https://example.com/a/b.git' })).rejects.toThrow(
      /already exists/,
    );
    expect(git.clone).not.toHaveBeenCalled();
  });

  it("refuses to clone the dashboard's own repository", async () => {
    const { useCase, git } = setup();
    await expect(
      useCase.execute({ cloneUrl: 'https://github.com/me/portwatch.git' }),
    ).rejects.toBeInstanceOf(InvalidStateError);
    expect(git.clone).not.toHaveBeenCalled();
  });

  it('cleans up the destination and wraps the error when the clone fails', async () => {
    const git = fakeGit({ clone: vi.fn(async () => Promise.reject(new Error('Permission denied (publickey)'))) });
    const { useCase, repo } = setup(git);

    await expect(useCase.execute({ cloneUrl: 'git@github.com:me/private.git' })).rejects.toThrow(
      /git clone failed: Permission denied \(publickey\)/,
    );
    expect(git.removeDir).toHaveBeenCalledWith('/projects/private');
    expect(await repo.list()).toHaveLength(0);
  });

  it('removes the clone when the repo has nothing deployable', async () => {
    const git = fakeGit({
      hasDockerfile: vi.fn(async () => false),
      findComposeFile: vi.fn(async () => null),
    });
    const { useCase, repo } = setup(git);

    await expect(useCase.execute({ cloneUrl: 'https://example.com/a/docs.git' })).rejects.toThrow(
      /no Dockerfile or docker-compose/,
    );
    expect(git.removeDir).toHaveBeenCalledWith('/projects/docs');
    expect(await repo.list()).toHaveLength(0);
  });

  it('accepts a repo with only a Dockerfile (empty composeFile)', async () => {
    const git = fakeGit({
      hasDockerfile: vi.fn(async () => true),
      findComposeFile: vi.fn(async () => null),
    });
    const { useCase } = setup(git);
    const { project } = await useCase.execute({ cloneUrl: 'https://example.com/a/svc.git' });
    expect(project).toMatchObject({ hasDockerfile: true, composeFile: '' });
  });

  it('writes the .env, dropping blank keys, and stores the cleaned vars', async () => {
    const { useCase, git } = setup();

    const { project } = await useCase.execute({
      cloneUrl: 'https://example.com/a/svc.git',
      envVars: [
        { key: 'TOKEN', value: 'abc' },
        { key: '   ', value: 'ignored' },
      ],
    });

    expect(git.writeEnvFile).toHaveBeenCalledWith('/projects/svc', [{ key: 'TOKEN', value: 'abc' }]);
    expect(project.envVars).toEqual([{ key: 'TOKEN', value: 'abc' }]);
  });

  it('does not write a .env when there are no variables', async () => {
    const { useCase, git } = setup();
    await useCase.execute({ cloneUrl: 'https://example.com/a/svc.git' });
    expect(git.writeEnvFile).not.toHaveBeenCalled();
  });

  it('rolls the clone back when writing the .env fails', async () => {
    const git = fakeGit({ writeEnvFile: vi.fn(async () => Promise.reject(new Error('disk full'))) });
    const { useCase, repo } = setup(git);

    await expect(
      useCase.execute({
        cloneUrl: 'https://example.com/a/svc.git',
        envVars: [{ key: 'A', value: '1' }],
      }),
    ).rejects.toThrow(/write \.env failed: disk full/);
    expect(git.removeDir).toHaveBeenCalledWith('/projects/svc');
    expect(await repo.list()).toHaveLength(0);
  });
});
