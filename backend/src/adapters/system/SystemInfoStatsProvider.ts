import si from 'systeminformation';
import type {
  SystemStatsProvider,
  StatsListener,
  Unsubscribe,
} from '../../domain/ports/StatsProvider.js';
import type { SystemStats } from '../../domain/entities/SystemStats.js';

interface NetSample {
  rx: number;
  tx: number;
}

export class SystemInfoStatsProvider implements SystemStatsProvider {
  private listeners = new Set<StatsListener<SystemStats>>();
  private timer: NodeJS.Timeout | null = null;
  private lastNet: NetSample | null = null;

  async snapshot(): Promise<SystemStats> {
    const [cpu, mem, fs, net, load, host, time] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
      si.currentLoad(),
      si.osInfo(),
      si.time(),
    ]);

    const cpuPercent = cpu.currentLoad ?? 0;
    const loadArr = (load.avgLoad ?? 0).toString().split(',').map((n) => Number(n) || 0);
    const loadAvg: [number, number, number] = [
      loadArr[0] ?? 0,
      loadArr[1] ?? 0,
      loadArr[2] ?? 0,
    ];

    const root = fs.find((f) => f.mount === '/' || f.mount === 'C:') ?? fs[0];
    const totalRx = net.reduce((s, n) => s + (n.rx_bytes ?? 0), 0);
    const totalTx = net.reduce((s, n) => s + (n.tx_bytes ?? 0), 0);
    const { rxPerSec, txPerSec } = this.computeRates({ rx: totalRx, tx: totalTx });

    return {
      hostname: host.hostname ?? 'unknown',
      uptimeSeconds: time.uptime ?? 0,
      cpuPercent: Number(cpuPercent.toFixed(2)),
      cpuCores: cpu.cpus?.length ?? 1,
      loadAverage: loadAvg,
      memoryTotalBytes: mem.total ?? 0,
      memoryUsedBytes: mem.active ?? mem.used ?? 0,
      memoryFreeBytes: mem.available ?? mem.free ?? 0,
      diskTotalBytes: root?.size ?? 0,
      diskUsedBytes: root?.used ?? 0,
      networkRxBytesPerSec: rxPerSec,
      networkTxBytesPerSec: txPerSec,
      networkTotalBytes: totalRx + totalTx,
      timestamp: Date.now(),
    };
  }

  subscribe(listener: StatsListener<SystemStats>): Unsubscribe {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private start(): void {
    this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    try {
      const sample = await this.snapshot();
      for (const l of this.listeners) l(sample);
    } catch {
      /* ignore sampling errors */
    }
  }

  private computeRates(current: NetSample): { rxPerSec: number; txPerSec: number } {
    const now = Date.now();
    const prev = this.lastNet;
    this.lastNet = { ...current };
    if (!prev) return { rxPerSec: 0, txPerSec: 0 };
    const dt = 1;
    void now;
    return {
      rxPerSec: Math.max(0, current.rx - prev.rx) / dt,
      txPerSec: Math.max(0, current.tx - prev.tx) / dt,
    };
  }
}
