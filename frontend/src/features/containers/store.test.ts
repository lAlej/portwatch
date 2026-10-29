import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '@/test/fakeSocket';
import type { Container } from '@/shared/lib/schemas';

const containersApi = vi.hoisted(() => ({
  list: vi.fn(),
  start: vi.fn(),
  pause: vi.fn(),
  unpause: vi.fn(),
  restart: vi.fn(),
  kill: vi.fn(),
  inspect: vi.fn(),
  getProject: vi.fn(),
}));
vi.mock('./api', () => ({ containersApi }));

const socket = new FakeSocket();
vi.mock('@/shared/lib/ws', () => ({ getSocket: () => socket }));

import { subscribeToContainerChanges, useContainers } from './store';

const container = (id: string, overrides: Partial<Container> = {}): Container => ({
  id,
  name: `c-${id}`,
  image: 'nginx',
  state: 'running',
  status: 'Up 1 hour',
  created: 1,
  ports: [],
  uptimeSeconds: 3600,
  labels: {},
  ...overrides,
});

beforeEach(() => {
  Object.values(containersApi).forEach((f) => f.mockReset());
  containersApi.list.mockResolvedValue([]);
  useContainers.setState({ items: [], loading: false, error: null, projectFor: new Map() });
});
afterEach(() => vi.useRealTimers());

describe('fetch', () => {
  it('loads the container list', async () => {
    containersApi.list.mockResolvedValue([container('a'), container('b')]);
    const p = useContainers.getState().fetch();
    expect(useContainers.getState().loading).toBe(true);
    await p;
    expect(useContainers.getState()).toMatchObject({ loading: false, error: null });
    expect(useContainers.getState().items.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('keeps the previous list and reports the error when loading fails', async () => {
    useContainers.setState({ items: [container('a')] });
    containersApi.list.mockRejectedValue(new Error('Docker engine is not reachable'));
    await useContainers.getState().fetch();
    expect(useContainers.getState()).toMatchObject({
      loading: false,
      error: 'Docker engine is not reachable',
    });
    expect(useContainers.getState().items).toHaveLength(1);
  });

  it('uses a generic message when the rejection is not an Error', async () => {
    containersApi.list.mockRejectedValue('nope');
    await useContainers.getState().fetch();
    expect(useContainers.getState().error).toBe('Failed to load containers');
  });

  it('clears the previous error on a new attempt', async () => {
    useContainers.setState({ error: 'old' });
    await useContainers.getState().fetch();
    expect(useContainers.getState().error).toBeNull();
  });
});

describe.each(['start', 'pause', 'unpause', 'restart', 'kill'] as const)('%s', (action) => {
  it('calls the API, waits for Docker to settle, then refreshes the list', async () => {
    vi.useFakeTimers();
    containersApi[action].mockResolvedValue({ ok: true });
    containersApi.list.mockResolvedValue([container('abc', { state: 'paused' })]);

    const done = useContainers.getState()[action]('abc');
    await vi.advanceTimersByTimeAsync(0);
    expect(containersApi[action]).toHaveBeenCalledWith('abc');
    expect(containersApi.list).not.toHaveBeenCalled(); // still inside the 300ms grace period

    await vi.advanceTimersByTimeAsync(300);
    await done;
    expect(containersApi.list).toHaveBeenCalledTimes(1);
    expect(useContainers.getState().items[0]?.state).toBe('paused');
  });

  it('propagates API failures and does not refresh', async () => {
    containersApi[action].mockRejectedValue(new Error('Cannot pause container abc'));
    await expect(useContainers.getState()[action]('abc')).rejects.toThrow('Cannot pause container abc');
    expect(containersApi.list).not.toHaveBeenCalled();
  });
});

describe('refreshOne', () => {
  it('updates one container in place from its inspect state', async () => {
    useContainers.setState({ items: [container('a'), container('b')] });
    containersApi.inspect.mockResolvedValue({ State: { Status: 'exited' } });

    await useContainers.getState().refreshOne('b');

    const items = useContainers.getState().items;
    expect(items[0]).toMatchObject({ id: 'a', state: 'running' });
    expect(items[1]).toMatchObject({ id: 'b', state: 'exited', status: 'exited' });
  });

  it('ignores containers the list does not know about', async () => {
    useContainers.setState({ items: [container('a')] });
    await useContainers.getState().refreshOne('zzz');
    expect(containersApi.inspect).not.toHaveBeenCalled();
  });

  it('keeps the list intact when inspect fails', async () => {
    useContainers.setState({ items: [container('a')] });
    containersApi.inspect.mockRejectedValue(new Error('gone'));
    await useContainers.getState().refreshOne('a');
    expect(useContainers.getState().items[0]?.state).toBe('running');
  });

  it('falls back to "unknown" when inspect has no state', async () => {
    useContainers.setState({ items: [container('a')] });
    containersApi.inspect.mockResolvedValue({});
    await useContainers.getState().refreshOne('a');
    expect(useContainers.getState().items[0]?.state).toBe('unknown');
  });
});

describe('resolveProject', () => {
  it('asks the API once and serves repeats from the cache', async () => {
    containersApi.getProject.mockResolvedValue('p1');
    await expect(useContainers.getState().resolveProject('c1')).resolves.toBe('p1');
    await expect(useContainers.getState().resolveProject('c1')).resolves.toBe('p1');
    expect(containersApi.getProject).toHaveBeenCalledTimes(1);
  });

  it('caches "no project" (null) too, so standalone containers are not re-queried', async () => {
    containersApi.getProject.mockResolvedValue(null);
    await useContainers.getState().resolveProject('c1');
    await useContainers.getState().resolveProject('c1');
    expect(containersApi.getProject).toHaveBeenCalledTimes(1);
  });

  it('resolves to null when the lookup fails', async () => {
    containersApi.getProject.mockRejectedValue(new Error('boom'));
    await expect(useContainers.getState().resolveProject('c1')).resolves.toBeNull();
  });

  it('caches per container', async () => {
    containersApi.getProject.mockImplementation(async (id: string) => (id === 'c1' ? 'p1' : 'p2'));
    await useContainers.getState().resolveProject('c1');
    await useContainers.getState().resolveProject('c2');
    expect(useContainers.getState().projectFor.get('c1')).toBe('p1');
    expect(useContainers.getState().projectFor.get('c2')).toBe('p2');
  });
});

describe('subscribeToContainerChanges', () => {
  beforeEach(() => socket.off('containers:changed'));

  it('refetches whenever the backend announces containers:changed', () => {
    const fetch = vi.fn(async () => undefined);
    const stop = subscribeToContainerChanges(fetch);
    socket.receive('containers:changed');
    socket.receive('containers:changed');
    expect(fetch).toHaveBeenCalledTimes(2);
    stop();
  });

  it('stops refetching after cleanup', () => {
    const fetch = vi.fn(async () => undefined);
    subscribeToContainerChanges(fetch)();
    socket.receive('containers:changed');
    expect(fetch).not.toHaveBeenCalled();
    expect(socket.listenerCount('containers:changed')).toBe(0);
  });
});
