import type Dockerode from 'dockerode';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContainerStats } from '../../domain/entities/ContainerStats.js';
import { DockerStatsProvider } from './DockerStatsProvider.js';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

interface RawOverrides {
  cpuTotal?: number;
  system?: number;
  cpus?: number;
  memUsage?: number;
  memLimit?: number;
  networks?: Record<string, { rx_bytes: number; tx_bytes: number }>;
  blkio?: Array<{ op: string; value: number }>;
}

function raw(o: RawOverrides = {}): string {
  return JSON.stringify({
    read: new Date().toISOString(),
    precpu_stats: { cpu_usage: { total_usage: 0 } },
    cpu_stats: {
      cpu_usage: { total_usage: o.cpuTotal ?? 0 },
      system_cpu_usage: o.system ?? 0,
      online_cpus: o.cpus ?? 1,
    },
    memory_stats: { usage: o.memUsage ?? 0, limit: o.memLimit ?? 0 },
    networks: o.networks,
    blkio_stats: { io_service_bytes_recursive: o.blkio },
  });
}

function setup() {
  const streams: PassThrough[] = [];
  const stats = vi.fn(async () => {
    const s = new PassThrough();
    streams.push(s);
    return s;
  });
  const getContainer = vi.fn(() => ({ stats }));
  const provider = new DockerStatsProvider({ getContainer } as unknown as Dockerode);
  const attached = async (n = 1) => {
    await vi.waitFor(() => expect(streams.length).toBeGreaterThanOrEqual(n));
    await tick();
    return streams[n - 1]!;
  };
  const collect = (id = 'c1') => {
    const samples: ContainerStats[] = [];
    const off = provider.subscribe(id, (s) => samples.push(s));
    return { samples, off };
  };
  return { provider, streams, stats, getContainer, attached, collect };
}

describe('DockerStatsProvider', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  describe('sample computation', () => {
    it('computes CPU% from the delta between consecutive samples', async () => {
      const { samples, off } = t.collect();
      const s = await t.attached();

      s.write(raw({ cpuTotal: 1_000, system: 10_000 }));
      await tick();
      s.write(raw({ cpuTotal: 1_500, system: 11_000 })); // 500 / 1000 of one core
      await tick();

      expect(samples).toHaveLength(2);
      expect(samples[1]!.cpuPercent).toBe(50);
      off();
    });

    it('scales CPU% by the number of online cores and caps it at 100', async () => {
      const { samples, off } = t.collect();
      const s = await t.attached();

      s.write(raw({ cpuTotal: 0, system: 0, cpus: 4 }));
      await tick();
      s.write(raw({ cpuTotal: 100, system: 1_000, cpus: 4 })); // 10% of the host x 4 cores = 40%
      await tick();
      s.write(raw({ cpuTotal: 5_000, system: 2_000, cpus: 4 })); // would be 2000% -> capped
      await tick();

      expect(samples[1]!.cpuPercent).toBe(40);
      expect(samples[2]!.cpuPercent).toBe(100);
      off();
    });

    it('reports 0% when the host counter did not advance or went backwards', async () => {
      const { samples, off } = t.collect();
      const s = await t.attached();

      s.write(raw({ cpuTotal: 100, system: 1_000 }));
      await tick();
      s.write(raw({ cpuTotal: 200, system: 1_000 })); // no host delta
      await tick();
      s.write(raw({ cpuTotal: 50, system: 2_000 })); // container counter reset
      await tick();

      expect(samples[1]!.cpuPercent).toBe(0);
      expect(samples[2]!.cpuPercent).toBe(0);
      off();
    });

    it('reports memory in bytes and as a percentage of the limit', async () => {
      const { samples, off } = t.collect();
      const s = await t.attached();
      s.write(raw({ memUsage: 256 * 1024 * 1024, memLimit: 1024 * 1024 * 1024 }));
      await tick();

      expect(samples[0]).toMatchObject({
        memoryUsageBytes: 256 * 1024 * 1024,
        memoryLimitBytes: 1024 * 1024 * 1024,
        memoryPercent: 25,
      });
      off();
    });

    it('reports 0% memory instead of NaN when there is no limit', async () => {
      const { samples, off } = t.collect();
      const s = await t.attached();
      s.write(raw({ memUsage: 100, memLimit: 0 }));
      await tick();
      expect(samples[0]!.memoryPercent).toBe(0);
      off();
    });

    it('sums traffic across every network interface', async () => {
      const { samples, off } = t.collect();
      const s = await t.attached();
      s.write(
        raw({
          networks: {
            eth0: { rx_bytes: 100, tx_bytes: 10 },
            eth1: { rx_bytes: 50, tx_bytes: 5 },
          },
        }),
      );
      await tick();
      expect(samples[0]).toMatchObject({ networkRxBytes: 150, networkTxBytes: 15 });
      off();
    });

    it('handles containers with no network (network_mode: none)', async () => {
      const { samples, off } = t.collect();
      const s = await t.attached();
      s.write(raw());
      await tick();
      expect(samples[0]).toMatchObject({ networkRxBytes: 0, networkTxBytes: 0 });
      off();
    });

    it('sums block IO reads and writes regardless of the op casing', async () => {
      const { samples, off } = t.collect();
      const s = await t.attached();
      s.write(
        raw({
          blkio: [
            { op: 'Read', value: 100 },
            { op: 'read', value: 50 },
            { op: 'Write', value: 30 },
            { op: 'write', value: 20 },
            { op: 'Total', value: 999 },
          ],
        }),
      );
      await tick();
      expect(samples[0]).toMatchObject({ blockReadBytes: 150, blockWriteBytes: 50 });
      off();
    });

    it('stamps each sample with the container id and the current time', async () => {
      const before = Date.now();
      const { samples, off } = t.collect('abc');
      const s = await t.attached();
      s.write(raw());
      await tick();
      expect(samples[0]!.id).toBe('abc');
      expect(samples[0]!.timestamp).toBeGreaterThanOrEqual(before);
      off();
    });

    it('ignores malformed frames and keeps streaming', async () => {
      const { samples, off } = t.collect();
      const s = await t.attached();
      s.write('{not json');
      await tick();
      s.write(raw({ memUsage: 5, memLimit: 10 }));
      await tick();
      expect(samples).toHaveLength(1);
      expect(samples[0]!.memoryPercent).toBe(50);
      off();
    });
  });

  describe('subscriptions', () => {
    it('opens a single Docker stream shared by every listener of a container', async () => {
      const a = t.collect();
      const b = t.collect();
      const s = await t.attached();
      s.write(raw());
      await tick();

      expect(t.stats).toHaveBeenCalledTimes(1);
      expect(t.stats).toHaveBeenCalledWith({ stream: true });
      expect(a.samples).toHaveLength(1);
      expect(b.samples).toHaveLength(1);
      a.off();
      b.off();
    });

    it('keeps the stream open until the last listener leaves, then closes it', async () => {
      const a = t.collect();
      const b = t.collect();
      const s = await t.attached();

      a.off();
      expect(s.destroyed).toBe(false);
      s.write(raw());
      await tick();
      expect(b.samples).toHaveLength(1);
      expect(a.samples).toHaveLength(0);

      b.off();
      expect(s.destroyed).toBe(true);
    });

    it('streams different containers independently', async () => {
      const a = t.collect('one');
      const b = t.collect('two');
      await t.attached(2);
      expect(t.getContainer).toHaveBeenCalledWith('one');
      expect(t.getContainer).toHaveBeenCalledWith('two');
      a.off();
      expect(t.streams[0]!.destroyed).toBe(true);
      expect(t.streams[1]!.destroyed).toBe(false);
      b.off();
    });

    it('starts from a clean CPU baseline after everyone unsubscribed and came back', async () => {
      const first = t.collect();
      const s1 = await t.attached();
      s1.write(raw({ cpuTotal: 9_000_000, system: 10_000_000 }));
      await tick();
      first.off();

      const second = t.collect();
      const s2 = await t.attached(2);
      s2.write(raw({ cpuTotal: 100, system: 1_000 }));
      await tick();
      s2.write(raw({ cpuTotal: 200, system: 2_000 }));
      await tick();

      // 100/1000 of one core. A stale baseline from the first session would give 0%.
      expect(second.samples[1]!.cpuPercent).toBe(10);
      second.off();
    });

    it('unsubscribing twice is harmless', async () => {
      const { off } = t.collect();
      await t.attached();
      off();
      expect(() => off()).not.toThrow();
    });

    it('does not leak the Docker stream when the listener leaves before it opens', async () => {
      let resolveStats!: (s: PassThrough) => void;
      t.stats.mockImplementationOnce(() => new Promise<PassThrough>((r) => (resolveStats = r)) as never);
      const late = new PassThrough();

      const { off } = t.collect();
      off(); // gone before Docker answered
      resolveStats(late);

      await vi.waitFor(() => expect(late.destroyed).toBe(true));
    });

    it('delivers samples to the remaining listeners even if one of them throws', async () => {
      const received: ContainerStats[] = [];
      const offBad = t.provider.subscribe('c1', () => {
        throw new Error('socket closed');
      });
      const offGood = t.provider.subscribe('c1', (s) => received.push(s));
      const s = await t.attached();

      s.write(raw());
      await tick();

      expect(received).toHaveLength(1);
      offBad();
      offGood();
    });

    it('survives Docker refusing to open the stream', async () => {
      t.stats.mockRejectedValueOnce(new Error('no such container'));
      const { off } = t.collect();
      await tick();
      expect(() => off()).not.toThrow();
    });
  });

  describe('shutdown', () => {
    it('closes every open stream', async () => {
      t.collect('one');
      t.collect('two');
      await t.attached(2);
      t.provider.shutdown();
      expect(t.streams.every((s) => s.destroyed)).toBe(true);
    });
  });
});
