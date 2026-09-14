/* Hallmark · genre: modern-minimal · dashboard: bento grid · varied spans */

import { useEffect } from 'react';
import { z } from 'zod';
import { Cpu, MemoryStick, HardDrive, Network } from 'lucide-react';
import { useSystemStats } from './store';
import { api } from '@/shared/lib/api';
import { SystemStatsSchema } from '@/shared/lib/schemas';
import { splitBytes } from '@/shared/lib/format';

interface MetricCardProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  unit: string;
  sub: React.ReactNode;
  percent: number;
}

function MetricCard({ label, icon, value, unit, sub, percent }: MetricCardProps) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div
      className="
        bg-panel border border-line rounded-card p-4
        flex flex-col gap-4 min-h-[140px]
      "
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-muted uppercase tracking-[0.08em]">
          {label}
        </span>
        <span className="text-muted">{icon}</span>
      </div>

      <div className="flex items-baseline gap-1.5 tabular">
        <span className="text-3xl text-heading tracking-tight font-semibold">
          {value}
        </span>
        <span className="text-sm text-muted">{unit}</span>
      </div>

      <div className="mt-auto space-y-1.5">
        <div className="h-0.5 bg-raised rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${p}%` }}
          />
        </div>
        <div className="text-[11px] text-muted leading-relaxed">{sub}</div>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-12 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className={`
            col-span-12 sm:col-span-6 lg:col-span-3
            bg-panel border border-line rounded-card p-4 min-h-[140px]
            animate-pulse
          `}
        />
      ))}
    </div>
  );
}

export function SystemCards() {
  const start = useSystemStats((s) => s.start);
  const latest = useSystemStats((s) => s.latest);

  useEffect(() => {
    const off = start();
    api
      .get('/api/system/snapshot', z.object({ snapshot: SystemStatsSchema }))
      .then(({ snapshot }) => {
        if (!useSystemStats.getState().latest) {
          useSystemStats.setState({ latest: snapshot, history: [snapshot] });
        }
      })
      .catch(() => undefined);
    return off;
  }, [start]);

  const s = useSystemStats.getState().latest ?? latest;
  if (!s) return <Skeleton />;

  const cpuValue = ((s.cpuPercent / 100) * s.cpuCores).toFixed(1);
  const cpuPercent = s.cpuPercent;

  const mem = splitBytes(s.memoryUsedBytes);
  const memTotal = splitBytes(s.memoryTotalBytes);
  const memPercent = s.memoryTotalBytes > 0 ? (s.memoryUsedBytes / s.memoryTotalBytes) * 100 : 0;

  const disk = splitBytes(s.diskUsedBytes);
  const diskTotal = splitBytes(s.diskTotalBytes);
  const diskPercent = s.diskTotalBytes > 0 ? (s.diskUsedBytes / s.diskTotalBytes) * 100 : 0;

  const net = splitBytes(s.networkTotalBytes);
  const netPercent = (s.networkTotalBytes / NETWORK_CAP_BYTES) * 100;

  return (
    /* BENTO: 12-column grid, tiles get unequal spans on lg+ */
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 sm:col-span-6 lg:col-span-3">
        <MetricCard
          label="CPU"
          icon={<Cpu size={16} />}
          value={cpuValue}
          unit="vCPU"
          sub={
            <>
              <span className="text-ink">{cpuPercent.toFixed(0)}%</span>
              <span className="text-muted"> of {s.cpuCores} cores</span>
            </>
          }
          percent={cpuPercent}
        />
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-3">
        <MetricCard
          label="Memory"
          icon={<MemoryStick size={16} />}
          value={mem.value}
          unit={mem.unit}
          sub={
            <>
              <span className="text-ink">{memPercent.toFixed(0)}%</span>
              <span className="text-muted">
                {' '}of {memTotal.value} {memTotal.unit}
              </span>
            </>
          }
          percent={memPercent}
        />
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-3">
        <MetricCard
          label="Disk"
          icon={<HardDrive size={16} />}
          value={disk.value}
          unit={disk.unit}
          sub={
            <>
              <span className="text-ink">{diskPercent.toFixed(0)}%</span>
              <span className="text-muted">
                {' '}of {diskTotal.value} {diskTotal.unit}
              </span>
            </>
          }
          percent={diskPercent}
        />
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-3">
        <MetricCard
          label="Network"
          icon={<Network size={16} />}
          value={net.value}
          unit={net.unit}
          sub={
            <span className="text-muted">
              cumulative transfer
            </span>
          }
          percent={netPercent}
        />
      </div>
    </div>
  );
}

const NETWORK_CAP_BYTES = 5 * 1024 ** 4;