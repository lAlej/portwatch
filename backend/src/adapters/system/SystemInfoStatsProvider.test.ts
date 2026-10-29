import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const si = vi.hoisted(() => ({
  currentLoad: vi.fn(),
  mem: vi.fn(),
  fsSize: vi.fn(),
  networkStats: vi.fn(),
  osInfo: vi.fn(),
  time: vi.fn(),
}));
vi.mock('systeminformation', () => ({ default: si }));
const loadavg = vi.hoisted(() => vi.fn(() => [0.5, 0.4, 0.3]));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  loadavg,
}));

import type { SystemStats } from '../../domain/entities/SystemStats.js';
import { SystemInfoStatsProvider } from './SystemInfoStatsProvider.js';

const GB = 1024 ** 3;

function primeSystem(overrides: { net?: Array<{ rx_bytes: number; tx_bytes: number }>; fs?: unknown[] } = {}) {
  si.currentLoad.mockResolvedValue({ currentLoad: 37.456, avgLoad: 1.5, cpus: new Array(8).fill({}) });
  si.mem.mockResolvedValue({ total: 16 * GB, active: 6 * GB, used: 9 * GB, available: 10 * GB, free: 2 * GB });
  si.fsSize.mockResolvedValue(
    overrides.fs ?? [
      { mount: '/boot', size: 1 * GB, used: 0.5 * GB },
      { mount: '/', size: 100 * GB, used: 40 * GB },
    ],
  );
  si.networkStats.mockResolvedValue(overrides.net ?? [{ rx_bytes: 1000, tx_bytes: 500 }]);
  si.osInfo.mockResolvedValue({ hostname: 'vps-1' });
  si.time.mockResolvedValue({ uptime: 86_400 });
}

describe('SystemInfoStatsProvider', () => {
  beforeEach(() => {
    Object.values(si).forEach((fn) => fn.mockReset());
    primeSystem();
  });

  describe('snapshot', () => {
    it('maps systeminformation output to the domain entity', async () => {
      const before = Date.now();
      const s = await new SystemInfoStatsProvider().snapshot();

      expect(s).toMatchObject({
        hostname: 'vps-1',
        uptimeSeconds: 86_400,
        cpuPercent: 37.46,
        cpuCores: 8,
        memoryTotalBytes: 16 * GB,
        memoryUsedBytes: 6 * GB, // "active", not cache-inflated "used"
        memoryFreeBytes: 10 * GB, // "available", not raw "free"
        diskTotalBytes: 100 * GB,
        diskUsedBytes: 40 * GB,
        networkTotalBytes: 1500,
      });
      expect(s.timestamp).toBeGreaterThanOrEqual(before);
    });

    it('measures the root filesystem rather than the first one listed', async () => {
      primeSystem({ fs: [{ mount: '/mnt/data', size: 5, used: 1 }, { mount: '/', size: 100, used: 40 }] });
      const s = await new SystemInfoStatsProvider().snapshot();
      expect(s.diskTotalBytes).toBe(100);
    });

    it('recognises C: as the root on Windows hosts', async () => {
      primeSystem({ fs: [{ mount: 'D:', size: 5, used: 1 }, { mount: 'C:', size: 200, used: 80 }] });
      expect((await new SystemInfoStatsProvider().snapshot()).diskTotalBytes).toBe(200);
    });

    it('falls back to the first filesystem, or zeros when there is none', async () => {
      primeSystem({ fs: [{ mount: '/data', size: 7, used: 3 }] });
      expect((await new SystemInfoStatsProvider().snapshot()).diskTotalBytes).toBe(7);

      primeSystem({ fs: [] });
      const s = await new SystemInfoStatsProvider().snapshot();
      expect(s).toMatchObject({ diskTotalBytes: 0, diskUsedBytes: 0 });
    });

    it('falls back to used/free memory when active/available are missing', async () => {
      si.mem.mockResolvedValue({ total: 8 * GB, used: 3 * GB, free: 5 * GB });
      const s = await new SystemInfoStatsProvider().snapshot();
      expect(s).toMatchObject({ memoryUsedBytes: 3 * GB, memoryFreeBytes: 5 * GB });
    });

    it('substitutes safe defaults for missing fields', async () => {
      si.currentLoad.mockResolvedValue({});
      si.mem.mockResolvedValue({});
      si.osInfo.mockResolvedValue({});
      si.time.mockResolvedValue({});
      const s = await new SystemInfoStatsProvider().snapshot();
      expect(s).toMatchObject({
        hostname: 'unknown',
        uptimeSeconds: 0,
        cpuPercent: 0,
        cpuCores: 1,
        memoryTotalBytes: 0,
      });
    });

    it('sums traffic over every network interface', async () => {
      primeSystem({
        net: [
          { rx_bytes: 100, tx_bytes: 10 },
          { rx_bytes: 200, tx_bytes: 20 },
        ],
      });
      expect((await new SystemInfoStatsProvider().snapshot()).networkTotalBytes).toBe(330);
    });

    it('propagates sampling failures to the caller', async () => {
      si.mem.mockRejectedValue(new Error('si failed'));
      await expect(new SystemInfoStatsProvider().snapshot()).rejects.toThrow('si failed');
    });

    it('reports the OS 1/5/15-minute load averages', async () => {
      loadavg.mockReturnValueOnce([2, 1.5, 1]);
      const { loadAverage } = await new SystemInfoStatsProvider().snapshot();
      expect(loadAverage).toEqual([2, 1.5, 1]);
    });
  });

  describe('network rates', () => {
    beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
    afterEach(() => vi.useRealTimers());

    it('reports 0 on the first sample, then bytes per second between samples', async () => {
      const provider = new SystemInfoStatsProvider();

      primeSystem({ net: [{ rx_bytes: 1000, tx_bytes: 500 }] });
      const first = await provider.snapshot();
      expect(first).toMatchObject({ networkRxBytesPerSec: 0, networkTxBytesPerSec: 0 });

      vi.advanceTimersByTime(1000);
      primeSystem({ net: [{ rx_bytes: 4000, tx_bytes: 800 }] });
      const second = await provider.snapshot();
      expect(second).toMatchObject({ networkRxBytesPerSec: 3000, networkTxBytesPerSec: 300 });
    });

    it('reports 0 rather than dividing by zero when two samples share a timestamp', async () => {
      const provider = new SystemInfoStatsProvider();
      primeSystem({ net: [{ rx_bytes: 0, tx_bytes: 0 }] });
      await provider.snapshot();
      primeSystem({ net: [{ rx_bytes: 5000, tx_bytes: 5000 }] });
      expect(await provider.snapshot()).toMatchObject({ networkRxBytesPerSec: 0, networkTxBytesPerSec: 0 });
    });

    it('clamps to 0 when the OS counters reset', async () => {
      const provider = new SystemInfoStatsProvider();
      primeSystem({ net: [{ rx_bytes: 9000, tx_bytes: 9000 }] });
      await provider.snapshot();
      vi.advanceTimersByTime(1000);
      primeSystem({ net: [{ rx_bytes: 10, tx_bytes: 10 }] });
      expect(await provider.snapshot()).toMatchObject({ networkRxBytesPerSec: 0, networkTxBytesPerSec: 0 });
    });

    it('derives rates from the elapsed time, not an assumed 1 second', async () => {
      const provider = new SystemInfoStatsProvider();
      primeSystem({ net: [{ rx_bytes: 0, tx_bytes: 0 }] });
      await provider.snapshot();
      vi.advanceTimersByTime(4000);
      primeSystem({ net: [{ rx_bytes: 8000, tx_bytes: 0 }] });
      expect((await provider.snapshot()).networkRxBytesPerSec).toBe(2000);
    });
  });

  describe('subscribe', () => {
    beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] }));
    afterEach(() => vi.useRealTimers());

    it('samples immediately and then every second', async () => {
      const provider = new SystemInfoStatsProvider();
      const samples: SystemStats[] = [];
      const off = provider.subscribe((s) => samples.push(s));

      await vi.advanceTimersByTimeAsync(0);
      expect(samples).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(samples).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(3000);
      expect(samples).toHaveLength(5);
      off();
    });

    it('shares one sampling loop between listeners', async () => {
      const provider = new SystemInfoStatsProvider();
      const a: SystemStats[] = [];
      const b: SystemStats[] = [];
      const offA = provider.subscribe((s) => a.push(s));
      const offB = provider.subscribe((s) => b.push(s));

      await vi.advanceTimersByTimeAsync(1000);

      expect(a).toHaveLength(b.length);
      expect(a.length).toBeGreaterThan(0);
      // two listeners, but one snapshot per tick
      expect(si.mem).toHaveBeenCalledTimes(a.length);
      offA();
      offB();
    });

    it('stops sampling when the last listener leaves, and restarts for the next one', async () => {
      const provider = new SystemInfoStatsProvider();
      const first = provider.subscribe(() => undefined);
      await vi.advanceTimersByTimeAsync(2000);
      first();
      const callsAtStop = si.mem.mock.calls.length;

      await vi.advanceTimersByTimeAsync(10_000);
      expect(si.mem).toHaveBeenCalledTimes(callsAtStop);

      const seen: SystemStats[] = [];
      const second = provider.subscribe((s) => seen.push(s));
      await vi.advanceTimersByTimeAsync(0);
      expect(seen).toHaveLength(1);
      second();
    });

    it('keeps running for the remaining listener when one leaves', async () => {
      const provider = new SystemInfoStatsProvider();
      const kept: SystemStats[] = [];
      const offA = provider.subscribe(() => undefined);
      const offB = provider.subscribe((s) => kept.push(s));
      offA();

      await vi.advanceTimersByTimeAsync(2000);
      expect(kept.length).toBeGreaterThanOrEqual(2);
      offB();
    });

    it('swallows sampling errors and recovers on the next tick', async () => {
      const provider = new SystemInfoStatsProvider();
      const samples: SystemStats[] = [];
      si.mem.mockRejectedValueOnce(new Error('transient'));

      const off = provider.subscribe((s) => samples.push(s));
      await vi.advanceTimersByTimeAsync(0);
      expect(samples).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(1000);
      expect(samples).toHaveLength(1);
      off();
    });
  });
});
