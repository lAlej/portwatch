import { describe, expect, it } from 'vitest';
import { InvalidStateError, NotFoundError } from '../../../lib/errors.js';
import {
  InMemoryDeploymentsRepository,
  InMemoryProjectsRepository,
  RecordingPublisher,
  fakeLogger,
  makeProject,
  scriptedRunner,
} from '../../../testing/fakes.js';
import type { DeployEvent } from '../../ports/DeployRunner.js';
import { TriggerDeploy } from './TriggerDeploy.js';

function setup(events: DeployEvent[], opts: { throwAfter?: Error; project?: ReturnType<typeof makeProject> } = {}) {
  const project = opts.project ?? makeProject();
  const projects = new InMemoryProjectsRepository([project]);
  const deployments = new InMemoryDeploymentsRepository();
  const publisher = new RecordingPublisher();
  const useCase = new TriggerDeploy({
    runner: scriptedRunner(events, opts.throwAfter),
    publisher,
    deployments,
    projects,
    logger: fakeLogger(),
  });
  return { useCase, deployments, publisher, project };
}

describe('TriggerDeploy', () => {
  it('records a queued deployment and returns its id immediately', async () => {
    const { useCase, deployments, publisher, project } = setup([{ kind: 'exit', exitCode: 0 }]);

    const { deploymentId } = await useCase.execute({ id: project.id });

    expect(deployments.history[0]).toMatchObject({
      id: deploymentId,
      projectId: project.id,
      status: 'queued',
      finishedAt: null,
      exitCode: null,
    });
    expect(publisher.events[0]).toEqual({
      deploymentId,
      event: { kind: 'status', status: 'queued' },
    });
    await publisher.finished();
  });

  it('walks the runner statuses and ends in success on exit code 0', async () => {
    const { useCase, deployments, publisher, project } = setup([
      { kind: 'status', status: 'pulling' },
      { kind: 'log', line: 'Already up to date.', stream: 'stdout' },
      { kind: 'status', status: 'building' },
      { kind: 'status', status: 'starting' },
      { kind: 'exit', exitCode: 0 },
    ]);

    const { deploymentId } = await useCase.execute({ id: project.id });
    await publisher.finished();

    expect(deployments.history.map((d) => d.status)).toEqual([
      'queued',
      'pulling',
      'building',
      'starting',
      'success',
    ]);
    const final = deployments.items[0]!;
    expect(final).toMatchObject({ id: deploymentId, status: 'success', exitCode: 0 });
    expect(final.finishedAt).toEqual(expect.any(Number));
    expect(publisher.events.map((e) => e.event.kind)).toContain('log');
    expect(publisher.containersChanged).toBe(1);
  });

  it('marks the deployment failed and keeps the error when the runner exits non-zero', async () => {
    const { useCase, deployments, publisher, project } = setup([
      { kind: 'status', status: 'building' },
      { kind: 'exit', exitCode: 1, error: 'compose build failed' },
    ]);

    await useCase.execute({ id: project.id });
    await publisher.finished();

    expect(deployments.items[0]).toMatchObject({
      status: 'failed',
      exitCode: 1,
      error: 'compose build failed',
    });
  });

  it('distinguishes a cancelled deploy from a failed one', async () => {
    const { useCase, deployments, publisher, project } = setup([
      { kind: 'exit', exitCode: 130, error: 'cancelled' },
    ]);

    await useCase.execute({ id: project.id });
    await publisher.finished();

    expect(deployments.items[0]?.status).toBe('cancelled');
  });

  it('turns a runner crash into a failed deployment instead of an unhandled rejection', async () => {
    const { useCase, deployments, publisher, project } = setup(
      [{ kind: 'status', status: 'building' }],
      { throwAfter: new Error('docker daemon went away') },
    );

    await useCase.execute({ id: project.id });
    await publisher.finished();

    expect(deployments.items[0]).toMatchObject({
      status: 'failed',
      error: 'docker daemon went away',
    });
    expect(publisher.events.at(-1)?.event).toEqual({
      kind: 'exit',
      exitCode: 1,
      error: 'docker daemon went away',
    });
  });

  it('throws NotFoundError for an unknown project and records nothing', async () => {
    const { useCase, deployments } = setup([]);
    await expect(useCase.execute({ id: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
    expect(deployments.history).toHaveLength(0);
  });

  it("refuses to redeploy the dashboard's own compose project", async () => {
    const { useCase, deployments } = setup([], { project: makeProject({ name: 'portwatch' }) });
    await expect(useCase.execute({ id: 'p1' })).rejects.toBeInstanceOf(InvalidStateError);
    expect(deployments.history).toHaveLength(0);
  });

  it('applies the self-project guard to names that sanitize to it', async () => {
    const { useCase } = setup([], { project: makeProject({ name: 'PortWatch' }) });
    await expect(useCase.execute({ id: 'p1' })).rejects.toBeInstanceOf(InvalidStateError);
  });
});
