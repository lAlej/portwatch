import Dockerode from 'dockerode';
import type { ContainerStats } from '../../domain/entities/ContainerStats.js';
import type {
  ContainerStatsProvider,
  StatsListener,
  Unsubscribe,
} from '../../domain/ports/StatsProvider.js';

interface RawStats {
  read: string;
  precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage?: number };
  cpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage?: number; online_cpus?: number };
  memory_stats: { usage: number; limit: number };
  networks?: Record<string, { rx_bytes: number; tx_bytes: number }>;
  blkio_stats?: {
    io_service_bytes_recursive?: Array<{ op: string; value: number }>;
  };
}

function computeCpuPercent(prev: RawStats | undefined, cur: RawStats): number {
  const cpuDelta = cur.cpu_stats.cpu_usage.total_usage - (prev?.cpu_stats.cpu_usage.total_usage ?? 0);
  const sysDelta =
    (cur.cpu_stats.system_cpu_usage ?? 0) - (prev?.cpu_stats.system_cpu_usage ?? 0);
  const cores = cur.cpu_stats.online_cpus ?? 1;
  if (sysDelta <= 0 || cpuDelta < 0) return 0;
  return Math.min(100, (cpuDelta / sysDelta) * cores * 100);
}

function computeNet(cur: RawStats): { rx: number; tx: number } {
  let rx = 0;
  let tx = 0;
  for (const v of Object.values(cur.networks ?? {})) {
    rx += v.rx_bytes;
    tx += v.tx_bytes;
  }
  return { rx, tx };
}

function computeBlock(cur: RawStats): { read: number; write: number } {
  let read = 0;
  let write = 0;
  for (const entry of cur.blkio_stats?.io_service_bytes_recursive ?? []) {
    if (entry.op === 'Read' || entry.op === 'read') read += entry.value;
    if (entry.op === 'Write' || entry.op === 'write') write += entry.value;
  }
  return { read, write };
}

export class DockerStatsProvider implements ContainerStatsProvider {
  private readonly subs = new Map<string, Set<StatsListener<ContainerStats>>>();
  private readonly prevById = new Map<string, RawStats>();
  private readonly streams = new Map<string, NodeJS.ReadableStream>();

  constructor(private readonly docker: Dockerode) {}

  subscribe(id: string, listener: StatsListener<ContainerStats>): Unsubscribe {
    let set = this.subs.get(id);
    if (!set) {
      set = new Set();
      this.subs.set(id, set);
    }
    set.add(listener);
    if (set.size === 1) void this.startStream(id);

    return () => {
      const s = this.subs.get(id);
      if (!s) return;
      s.delete(listener);
      if (s.size === 0) {
        this.subs.delete(id);
        this.stopStream(id);
      }
    };
  }

  private async startStream(id: string): Promise<void> {
    try {
      const stream = await this.docker.getContainer(id).stats({ stream: true });
      const s = stream as unknown as NodeJS.ReadableStream;
      this.streams.set(id, s);
      let prev = this.prevById.get(id);
      s.on('data', (chunk: Buffer | string) => {
        try {
          const raw = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
          const cur = JSON.parse(raw) as RawStats;
          const cpu = computeCpuPercent(prev, cur);
          const { rx, tx } = computeNet(cur);
          const blk = computeBlock(cur);
          const memUsed = cur.memory_stats.usage ?? 0;
          const memLim = cur.memory_stats.limit ?? 0;
          const sample: ContainerStats = {
            id,
            cpuPercent: Number(cpu.toFixed(2)),
            memoryUsageBytes: memUsed,
            memoryLimitBytes: memLim,
            memoryPercent: memLim > 0 ? Number(((memUsed / memLim) * 100).toFixed(2)) : 0,
            networkRxBytes: rx,
            networkTxBytes: tx,
            blockReadBytes: blk.read,
            blockWriteBytes: blk.write,
            timestamp: Date.now(),
          };
          prev = cur;
          this.prevById.set(id, cur);
          const listeners = this.subs.get(id);
          if (listeners) for (const l of listeners) l(sample);
        } catch {
          // ignore malformed frames
        }
      });
      s.on('error', () => this.stopStream(id));
    } catch {
      // ignore
    }
  }

  private stopStream(id: string): void {
    const s = this.streams.get(id);
    if (s) {
      const maybe = s as unknown as { destroy?: () => void; end?: () => void };
      try {
        if (typeof maybe.destroy === 'function') maybe.destroy();
        else if (typeof maybe.end === 'function') maybe.end();
      } catch {
        /* ignore */
      }
    }
    this.streams.delete(id);
    this.prevById.delete(id);
  }

  shutdown(): void {
    for (const id of [...this.streams.keys()]) this.stopStream(id);
  }
}
