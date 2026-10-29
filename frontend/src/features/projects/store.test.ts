import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '@/test/fakeSocket';
import type { Deployment, Project } from '@/shared/lib/schemas';

const projectsApi = vi.hoisted(() => ({
  list: vi.fn(),
  clone: vi.fn(),
  createAdHoc: vi.fn(),
  updateEnv: vi.fn(),
  remove: vi.fn(),
  deployments: vi.fn(),
  deploy: vi.fn(),
  getCompose: vi.fn(),
  updateCompose: vi.fn(),
}));
vi.mock('./api', () => ({ projectsApi }));

const socket = new FakeSocket();
vi.mock('@/shared/lib/ws', () => ({ getSocket: () => socket }));

import { useProjects } from './store';

const project = (id: string, overrides: Partial<Project> = {}): Project => ({
  id,
  name: `proj-${id}`,
  cloneUrl: 'https://example.com/x.git',
  path: `/projects/${id}`,
  composeFile: 'docker-compose.yml',
  hasDockerfile: false,
  createdAt: 1,
  envVars: [],
  ...overrides,
});

const deployment = (status: Deployment['status']): Deployment => ({
  id: 'd',
  projectId: 'p',
  status,
  startedAt: 1,
  finishedAt: null,
  exitCode: null,
});

const initial = {
  items: [],
  loading: false,
  error: null,
  lastStatusByProject: {},
  deploys: {},
  activeDeployId: null,
  composeCache: {},
  composeLoading: {},
};

beforeEach(() => {
  Object.values(projectsApi).forEach((f) => f.mockReset());
  socket.emitted.length = 0;
  useProjects.setState(initial);
});

describe('fetch', () => {
  it('loads projects and the latest deployment status of each', async () => {
    projectsApi.list.mockResolvedValue([project('a'), project('b')]);
    projectsApi.deployments.mockImplementation(async (id: string) =>
      id === 'a' ? [deployment('success'), deployment('failed')] : [],
    );

    await useProjects.getState().fetch();

    const s = useProjects.getState();
    expect(s.items.map((p) => p.id)).toEqual(['a', 'b']);
    expect(s.lastStatusByProject).toEqual({ a: 'success', b: undefined });
    expect(s.loading).toBe(false);
  });

  it('still shows a project when its deployment history cannot be read', async () => {
    projectsApi.list.mockResolvedValue([project('a')]);
    projectsApi.deployments.mockRejectedValue(new Error('boom'));
    await useProjects.getState().fetch();
    expect(useProjects.getState().items).toHaveLength(1);
    expect(useProjects.getState().lastStatusByProject).toEqual({ a: undefined });
  });

  it('reports a failed list request', async () => {
    projectsApi.list.mockRejectedValue(new Error('Unauthorized'));
    await useProjects.getState().fetch();
    expect(useProjects.getState()).toMatchObject({ loading: false, error: 'Unauthorized' });
  });
});

describe('adding projects', () => {
  it('add clones and puts the new project first', async () => {
    useProjects.setState({ items: [project('old')] });
    projectsApi.clone.mockResolvedValue(project('new'));

    const created = await useProjects.getState().add('https://example.com/new.git', [{ key: 'A', value: '1' }]);

    expect(projectsApi.clone).toHaveBeenCalledWith('https://example.com/new.git', [{ key: 'A', value: '1' }]);
    expect(created.id).toBe('new');
    expect(useProjects.getState().items.map((p) => p.id)).toEqual(['new', 'old']);
  });

  it('createAdHoc sends name, compose and env, and puts the project first', async () => {
    projectsApi.createAdHoc.mockResolvedValue(project('adhoc', { cloneUrl: '' }));
    await useProjects.getState().createAdHoc('web', 'services: {}', []);
    expect(projectsApi.createAdHoc).toHaveBeenCalledWith({
      name: 'web',
      composeContent: 'services: {}',
      envVars: [],
    });
    expect(useProjects.getState().items[0]?.id).toBe('adhoc');
  });

  it('leaves the list untouched and rethrows when the server refuses', async () => {
    useProjects.setState({ items: [project('old')] });
    projectsApi.clone.mockRejectedValue(new Error('Project "x" already exists'));
    await expect(useProjects.getState().add('u', [])).rejects.toThrow('already exists');
    expect(useProjects.getState().items.map((p) => p.id)).toEqual(['old']);
  });
});

describe('blank environment rows', () => {
  const rows = [
    { key: ' API_KEY ', value: 'secret' },
    { key: '', value: 'orphan' },
    { key: '   ', value: '' },
  ];

  it('are dropped (and keys trimmed) before cloning', async () => {
    projectsApi.clone.mockResolvedValue(project('n'));
    await useProjects.getState().add('https://example.com/n.git', rows);
    expect(projectsApi.clone).toHaveBeenCalledWith('https://example.com/n.git', [
      { key: 'API_KEY', value: 'secret' },
    ]);
  });

  it('are dropped before creating an ad-hoc project', async () => {
    projectsApi.createAdHoc.mockResolvedValue(project('n', { cloneUrl: '' }));
    await useProjects.getState().createAdHoc('web', 'services: {}', rows);
    expect(projectsApi.createAdHoc).toHaveBeenCalledWith({
      name: 'web',
      composeContent: 'services: {}',
      envVars: [{ key: 'API_KEY', value: 'secret' }],
    });
  });

  it('are dropped before saving, and the cleaned list is what gets stored locally', async () => {
    useProjects.setState({ items: [project('a')] });
    projectsApi.updateEnv.mockResolvedValue({ ok: true });
    await useProjects.getState().updateEnv('a', rows);
    expect(projectsApi.updateEnv).toHaveBeenCalledWith('a', [{ key: 'API_KEY', value: 'secret' }]);
    expect(useProjects.getState().items[0]!.envVars).toEqual([{ key: 'API_KEY', value: 'secret' }]);
  });
});

describe('updateEnv / remove', () => {
  it('updateEnv replaces the env of just that project, after the server accepted it', async () => {
    useProjects.setState({ items: [project('a'), project('b')] });
    projectsApi.updateEnv.mockResolvedValue({ ok: true });

    await useProjects.getState().updateEnv('b', [{ key: 'K', value: 'v' }]);

    const [a, b] = useProjects.getState().items;
    expect(a!.envVars).toEqual([]);
    expect(b!.envVars).toEqual([{ key: 'K', value: 'v' }]);
  });

  it('updateEnv does not change local state when the server rejects the variables', async () => {
    useProjects.setState({ items: [project('a')] });
    projectsApi.updateEnv.mockRejectedValue(new Error('validation'));
    await expect(useProjects.getState().updateEnv('a', [{ key: 'bad key', value: '' }])).rejects.toThrow();
    expect(useProjects.getState().items[0]!.envVars).toEqual([]);
  });

  it('remove drops the project and its remembered deploy status', async () => {
    useProjects.setState({
      items: [project('a'), project('b')],
      lastStatusByProject: { a: 'success', b: 'failed' },
    });
    projectsApi.remove.mockResolvedValue({ ok: true });

    await useProjects.getState().remove('a');

    expect(useProjects.getState().items.map((p) => p.id)).toEqual(['b']);
    expect(useProjects.getState().lastStatusByProject).toEqual({ b: 'failed' });
  });

  it('remove keeps the project when the server fails', async () => {
    useProjects.setState({ items: [project('a')] });
    projectsApi.remove.mockRejectedValue(new Error('nope'));
    await expect(useProjects.getState().remove('a')).rejects.toThrow();
    expect(useProjects.getState().items).toHaveLength(1);
  });
});

describe('deploying', () => {
  it('triggerDeploy registers a queued deploy and makes it the active one', async () => {
    projectsApi.deploy.mockResolvedValue('dep-1');
    await expect(useProjects.getState().triggerDeploy('p1')).resolves.toBe('dep-1');
    const s = useProjects.getState();
    expect(s.activeDeployId).toBe('dep-1');
    expect(s.deploys['dep-1']).toEqual({
      deploymentId: 'dep-1',
      projectId: 'p1',
      status: 'queued',
      logs: [],
      exitCode: null,
      error: undefined,
    });
  });

  it('triggerDeploy leaves no ghost deploy when the server refuses (e.g. self project)', async () => {
    projectsApi.deploy.mockRejectedValue(new Error('is this dashboard\'s own compose project'));
    await expect(useProjects.getState().triggerDeploy('p1')).rejects.toThrow();
    expect(useProjects.getState().deploys).toEqual({});
    expect(useProjects.getState().activeDeployId).toBeNull();
  });

  it('openDeploy and closeDeploy manage the active modal', () => {
    useProjects.setState({
      deploys: {
        d1: { deploymentId: 'd1', projectId: 'p', status: 'queued', logs: [], exitCode: null, error: undefined },
        d2: { deploymentId: 'd2', projectId: 'p', status: 'queued', logs: [], exitCode: null, error: undefined },
      },
    });
    useProjects.getState().openDeploy('d1');
    expect(useProjects.getState().activeDeployId).toBe('d1');

    useProjects.getState().closeDeploy('d2'); // closing another deploy keeps d1 active
    expect(useProjects.getState().activeDeployId).toBe('d1');
    expect(Object.keys(useProjects.getState().deploys)).toEqual(['d1']);

    useProjects.getState().closeDeploy('d1');
    expect(useProjects.getState().activeDeployId).toBeNull();
    expect(useProjects.getState().deploys).toEqual({});
  });
});

describe('subscribeDeploy', () => {
  async function start() {
    projectsApi.deploy.mockResolvedValue('dep-1');
    await useProjects.getState().triggerDeploy('p1');
    return useProjects.getState().subscribeDeploy('dep-1', 'p1');
  }

  it('joins the deploy channel and listens for its events', async () => {
    const stop = await start();
    expect(socket.emitted).toContainEqual({ event: 'subscribe', payload: { channel: 'deploy', id: 'dep-1' } });
    expect(socket.listenerCount('deploy:dep-1')).toBe(1);
    stop();
  });

  it('accumulates log lines with their stream', async () => {
    const stop = await start();
    socket.receive('deploy:dep-1', { kind: 'log', line: 'Cloning...', stream: 'stdout' });
    socket.receive('deploy:dep-1', { kind: 'log', line: 'warn: x', stream: 'stderr' });

    const logs = useProjects.getState().deploys['dep-1']!.logs;
    expect(logs.map((l) => [l.stream, l.line])).toEqual([
      ['stdout', 'Cloning...'],
      ['stderr', 'warn: x'],
    ]);
    stop();
  });

  it('tracks status changes on the deploy and on the project card', async () => {
    const stop = await start();
    socket.receive('deploy:dep-1', { kind: 'status', status: 'building' });
    expect(useProjects.getState().deploys['dep-1']!.status).toBe('building');
    expect(useProjects.getState().lastStatusByProject['p1']).toBe('building');
    stop();
  });

  it('records the exit code and error when the deploy ends', async () => {
    const stop = await start();
    socket.receive('deploy:dep-1', { kind: 'status', status: 'failed' });
    socket.receive('deploy:dep-1', { kind: 'exit', exitCode: 1, error: 'compose build failed' });

    expect(useProjects.getState().deploys['dep-1']).toMatchObject({
      status: 'failed',
      exitCode: 1,
      error: 'compose build failed',
    });
    expect(useProjects.getState().lastStatusByProject['p1']).toBe('failed');
    stop();
  });

  it('keeps only the last 5000 log lines', async () => {
    const stop = await start();
    for (let i = 0; i < 5100; i++) {
      socket.receive('deploy:dep-1', { kind: 'log', line: `l${i}`, stream: 'stdout' });
    }
    const logs = useProjects.getState().deploys['dep-1']!.logs;
    expect(logs).toHaveLength(5000);
    expect(logs[0]!.line).toBe('l100');
    expect(logs.at(-1)!.line).toBe('l5099');
    stop();
  });

  it('ignores events for a deploy that was closed', async () => {
    const stop = await start();
    useProjects.getState().closeDeploy('dep-1');
    socket.receive('deploy:dep-1', { kind: 'log', line: 'late', stream: 'stdout' });
    expect(useProjects.getState().deploys).toEqual({});
    stop();
  });

  it('does not leave duplicate listeners when subscribing twice (StrictMode remount)', async () => {
    const stop1 = await start();
    const stop2 = useProjects.getState().subscribeDeploy('dep-1', 'p1');
    expect(socket.listenerCount('deploy:dep-1')).toBe(1);

    socket.receive('deploy:dep-1', { kind: 'log', line: 'once', stream: 'stdout' });
    expect(useProjects.getState().deploys['dep-1']!.logs).toHaveLength(1);
    stop1();
    stop2();
  });

  it('unsubscribes on cleanup and stops receiving', async () => {
    const stop = await start();
    stop();
    expect(socket.emitted).toContainEqual({ event: 'unsubscribe', payload: { channel: 'deploy', id: 'dep-1' } });
    socket.receive('deploy:dep-1', { kind: 'log', line: 'after', stream: 'stdout' });
    expect(useProjects.getState().deploys['dep-1']!.logs).toEqual([]);
  });
});

describe('compose editing', () => {
  const file = { relPath: 'docker-compose.yml', content: 'services: {}' };

  it('loads a compose file once and serves repeats from the cache', async () => {
    projectsApi.getCompose.mockResolvedValue(file);
    await expect(useProjects.getState().loadCompose('p1')).resolves.toEqual(file);
    await expect(useProjects.getState().loadCompose('p1')).resolves.toEqual(file);
    expect(projectsApi.getCompose).toHaveBeenCalledTimes(1);
    expect(useProjects.getState().composeLoading['p1']).toBe(false);
  });

  it('refetches when a different relPath is requested', async () => {
    projectsApi.getCompose.mockResolvedValue(file);
    await useProjects.getState().loadCompose('p1');
    projectsApi.getCompose.mockResolvedValue({ relPath: 'deploy/prod.yml', content: 'x' });
    await expect(useProjects.getState().loadCompose('p1', 'deploy/prod.yml')).resolves.toMatchObject({
      relPath: 'deploy/prod.yml',
    });
    expect(projectsApi.getCompose).toHaveBeenCalledTimes(2);
  });

  it('serves the cache when the same relPath is requested explicitly', async () => {
    projectsApi.getCompose.mockResolvedValue(file);
    await useProjects.getState().loadCompose('p1');
    await useProjects.getState().loadCompose('p1', 'docker-compose.yml');
    expect(projectsApi.getCompose).toHaveBeenCalledTimes(1);
  });

  it('clears the loading flag and rethrows when loading fails', async () => {
    projectsApi.getCompose.mockRejectedValue(new Error('Compose file not found'));
    await expect(useProjects.getState().loadCompose('p1')).rejects.toThrow('not found');
    expect(useProjects.getState().composeLoading['p1']).toBe(false);
    expect(useProjects.getState().composeCache['p1']).toBeUndefined();
  });

  it('saveCompose caches the saved content only when the recreate succeeded', async () => {
    useProjects.setState({ composeCache: { p1: file } });
    projectsApi.updateCompose.mockResolvedValue({ exitCode: 0 });
    await useProjects.getState().saveCompose('p1', 'services: { web: {} }');
    expect(useProjects.getState().composeCache['p1']).toEqual({
      relPath: 'docker-compose.yml',
      content: 'services: { web: {} }',
    });
  });

  it('saveCompose keeps the old cache and returns the error when docker compose failed', async () => {
    useProjects.setState({ composeCache: { p1: file } });
    projectsApi.updateCompose.mockResolvedValue({ exitCode: 1, error: 'port is already allocated' });

    const result = await useProjects.getState().saveCompose('p1', 'broken');

    expect(result).toEqual({ exitCode: 1, error: 'port is already allocated' });
    expect(useProjects.getState().composeCache['p1']).toEqual(file);
  });

  it('saveCompose passes an explicit relPath through to the API and the cache', async () => {
    projectsApi.updateCompose.mockResolvedValue({ exitCode: 0 });
    await useProjects.getState().saveCompose('p1', 'x', 'deploy/prod.yml');
    expect(projectsApi.updateCompose).toHaveBeenCalledWith('p1', 'x', 'deploy/prod.yml');
    expect(useProjects.getState().composeCache['p1']).toEqual({ relPath: 'deploy/prod.yml', content: 'x' });
  });
});
