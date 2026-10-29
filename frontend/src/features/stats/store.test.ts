import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '@/test/fakeSocket';
import type { SystemStats } from '@/shared/lib/schemas';

const socket = new FakeSocket();
vi.mock('@/shared/lib/ws', () => ({ getSocket: () => socket }));

import { useSystemStats } from './store';

const sample = (n: number): SystemStats => ({
  hostname: 'h',
  uptimeSeconds: n,
  cpuPercent: n,
  cpuCores: 2,
  loadAverage: [0, 0, 0],
  memoryTotalBytes: 1,
  memoryUsedBytes: 1,
  memoryFreeBytes: 0,
  diskTotalBytes: 1,
  diskUsedBytes: 1,
  networkRxBytesPerSec: 0,
  networkTxBytesPerSec: 0,
  networkTotalBytes: 0,
  timestamp: n,
});

beforeEach(() => {
  socket.emitted.length = 0;
  socket.off('system:stats');
  useSystemStats.setState({ latest: null, history: [], historyMax: 60 });
});

describe('useSystemStats', () => {
  it('subscribes to the system channel and records every sample', () => {
    const stop = useSystemStats.getState().start();
    expect(socket.emitted).toContainEqual({ event: 'subscribe', payload: { channel: 'system:stats' } });

    socket.receive('system:stats', sample(1));
    socket.receive('system:stats', sample(2));

    expect(useSystemStats.getState().latest).toEqual(sample(2));
    expect(useSystemStats.getState().history.map((s) => s.timestamp)).toEqual([1, 2]);
    stop();
  });

  it('keeps a rolling window of 60 samples', () => {
    const stop = useSystemStats.getState().start();
    for (let i = 1; i <= 65; i++) socket.receive('system:stats', sample(i));
    const { history } = useSystemStats.getState();
    expect(history).toHaveLength(60);
    expect(history[0]!.timestamp).toBe(6);
    expect(history.at(-1)!.timestamp).toBe(65);
    stop();
  });

  it('stops listening and unsubscribes on cleanup', () => {
    const stop = useSystemStats.getState().start();
    stop();
    expect(socket.emitted).toContainEqual({ event: 'unsubscribe', payload: { channel: 'system:stats' } });
    socket.receive('system:stats', sample(9));
    expect(useSystemStats.getState().latest).toBeNull();
    expect(socket.listenerCount('system:stats')).toBe(0);
  });
});
