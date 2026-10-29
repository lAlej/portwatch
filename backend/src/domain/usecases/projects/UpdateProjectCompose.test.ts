import { describe, expect, it, vi } from 'vitest';
import { InvalidStateError, NotFoundError } from '../../../lib/errors.js';
import {
  InMemoryProjectsRepository,
  RecordingPublisher,
  fakeCompose,
  fakeLogger,
  lines,
  makeProject,
} from '../../../testing/fakes.js';
import { UpdateProjectCompose } from './UpdateProjectCompose.js';

function setup(compose = fakeCompose(), project = makeProject()) {
  const repo = new InMemoryProjectsRepository([project]);
  const publisher = new RecordingPublisher();
  const useCase = new UpdateProjectCompose({ repo, compose, publisher, logger: fakeLogger() });
  return { useCase, repo, publisher, compose, project };
}

describe('UpdateProjectCompose', () => {
  it('writes the file, force-recreates with the sanitized project name and notifies', async () => {
    const { useCase, repo, publisher, compose, project } = setup(
      fakeCompose(),
      makeProject({ name: 'My App!' }),
    );

    const result = await useCase.execute({ id: project.id, content: 'services: {}' });

    expect(result).toEqual({ exitCode: 0 });
    expect(repo.composeFiles.get('p1:docker-compose.yml')).toBe('services: {}');
    expect(compose.upForceRecreate).toHaveBeenCalledWith(
      project.path,
      'docker-compose.yml',
      'my-app',
    );
    expect(publisher.containersChanged).toBe(1);
  });

  it('writes to a custom relPath when one is given', async () => {
    const { useCase, repo, project } = setup();
    await useCase.execute({ id: project.id, content: 'x', relPath: 'deploy/compose.yml' });
    expect(repo.composeFiles.get('p1:deploy/compose.yml')).toBe('x');
  });

  it('reports the compose stderr and still notifies when the recreate fails', async () => {
    const compose = fakeCompose({
      upForceRecreate: vi.fn(() =>
        lines([{ line: 'port is already allocated', stream: 'stderr' }], new Error('exit 1')),
      ),
    });
    const { useCase, repo, publisher, project } = setup(compose);

    const result = await useCase.execute({ id: project.id, content: 'broken' });

    expect(result).toEqual({ exitCode: 1, error: 'port is already allocated' });
    // The file is already on disk even though the recreate failed.
    expect(repo.composeFiles.get('p1:docker-compose.yml')).toBe('broken');
    expect(publisher.containersChanged).toBe(1);
  });

  it('falls back to the thrown message when compose printed nothing on stderr', async () => {
    const compose = fakeCompose({
      upForceRecreate: vi.fn(() => lines([], new Error('spawn docker ENOENT'))),
    });
    const { useCase, project } = setup(compose);
    const result = await useCase.execute({ id: project.id, content: 'x' });
    expect(result).toEqual({ exitCode: 1, error: 'spawn docker ENOENT' });
  });

  it('throws NotFoundError for an unknown project without touching compose', async () => {
    const { useCase, compose } = setup();
    await expect(useCase.execute({ id: 'nope', content: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    expect(compose.upForceRecreate).not.toHaveBeenCalled();
  });

  it("refuses to rewrite and recreate the dashboard's own stack", async () => {
    const { useCase, repo, compose } = setup(fakeCompose(), makeProject({ name: 'portwatch' }));
    await expect(useCase.execute({ id: 'p1', content: 'x' })).rejects.toBeInstanceOf(
      InvalidStateError,
    );
    expect(repo.composeFiles.size).toBe(0);
    expect(compose.upForceRecreate).not.toHaveBeenCalled();
  });
});
