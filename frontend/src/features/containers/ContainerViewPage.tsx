/* Hallmark · genre: modern-minimal · detail: long document · stats strip · tab strip */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Cpu, MemoryStick, Network, HardDrive } from 'lucide-react';
import { StateDot } from '@/shared/ui/Badge';
import { containersApi } from './api';
import { StatsCharts } from './StatsCharts';
import { LogTerminal } from '@/features/logs/LogTerminal';
import type { ContainerState, ContainerStats } from '@/shared/lib/schemas';
import { getSocket } from '@/shared/lib/ws';
import { ContainerStatsSchema } from '@/shared/lib/schemas';
import { formatBytes, formatBytesPerSec, formatPercent } from '@/shared/lib/format';

type Tab = 'stats' | 'logs' | 'inspect';

export function ContainerViewPage() {
  const { id = '' } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('stats');
  const [name, setName] = useState<string>('');
  const [state, setState] = useState<ContainerState>('unknown');
  const [inspect, setInspect] = useState<unknown>(null);
  const [lastSample, setLastSample] = useState<ContainerStats | null>(null);

  useEffect(() => {
    if (!id) return;
    void containersApi.inspect(id).then((info) => {
      const n = (info?.Name as string | undefined)?.replace(/^\//, '');
      const st = info?.State as { Status?: string } | undefined;
      setName(n ?? id.slice(0, 12));
      setState((st?.Status as ContainerState) ?? 'unknown');
    });
  }, [id]);

  useEffect(() => {
    if (tab !== 'inspect' || !id) return;
    void containersApi.inspect(id).then(setInspect);
  }, [tab, id]);

  useEffect(() => {
    if (!id) return;
    const socket = getSocket();
    const channel = `container:stats:${id}`;
    const onSample = (raw: unknown) => {
      const parsed = ContainerStatsSchema.safeParse(raw);
      if (parsed.success) setLastSample(parsed.data);
    };
    socket.on(channel, onSample);
    socket.emit('subscribe', { channel: 'container:stats', id });
    return () => {
      socket.emit('unsubscribe', { channel: 'container:stats', id });
      socket.off(channel, onSample);
    };
  }, [id]);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Link
            to="/"
            className="inline-flex items-center gap-1 hover:text-ink transition-colors duration-[var(--dur-micro)]"
          >
            <ArrowLeft size={12} /> Containers
          </Link>
          <span className="text-line">/</span>
          <span className="text-ink mono">{name || id.slice(0, 12)}</span>
        </div>

        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-text-2xl text-heading tracking-tight font-semibold">
                {name || id.slice(0, 12)}
              </h1>
              <StateDot state={state} />
            </div>
            <p className="text-sm text-muted max-w-2xl">
              Live performance, network activity, block I/O, logs, and inspect data.
            </p>
          </div>

          <div className="flex items-center gap-2 mono text-xs text-muted">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-state-running animate-pulse-live" />
            <span className="text-state-running font-medium">live</span>
            <span className="text-line">·</span>
            <span>refreshed just now</span>
          </div>
        </div>
      </header>

      {/* stats strip — four equal tiles, no per-card icon-tile feature pattern */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SmallMetric
          label="CPU"
          icon={<Cpu size={15} />}
          value={lastSample ? formatPercent(lastSample.cpuPercent) : '—'}
          sub={lastSample ? `${((lastSample.cpuPercent / 100) * 1).toFixed(2)} vCPU avg` : 'awaiting sample'}
        />
        <SmallMetric
          label="Memory"
          icon={<MemoryStick size={15} />}
          value={lastSample ? formatBytes(lastSample.memoryUsageBytes) : '—'}
          sub={
            lastSample
              ? `${formatPercent(lastSample.memoryPercent, 1)} of ${formatBytes(lastSample.memoryLimitBytes)} limit`
              : 'awaiting sample'
          }
        />
        <SmallMetric
          label="Network I/O"
          icon={<Network size={15} />}
          value={
            lastSample
              ? formatBytesPerSec(Math.max(lastSample.networkRxBytes, lastSample.networkTxBytes))
              : '—'
          }
          sub={
            lastSample
              ? `${formatBytes(lastSample.networkRxBytes)} in · ${formatBytes(lastSample.networkTxBytes)} out`
              : 'awaiting sample'
          }
        />
        <SmallMetric
          label="Block I/O"
          icon={<HardDrive size={15} />}
          value={
            lastSample
              ? formatBytesPerSec(Math.max(lastSample.blockReadBytes, lastSample.blockWriteBytes))
              : '—'
          }
          sub={
            lastSample
              ? `${formatBytes(lastSample.blockReadBytes)} read · ${formatBytes(lastSample.blockWriteBytes)} write`
              : 'awaiting sample'
          }
        />
      </div>

      {/* tab strip — underline-on-active, no fill */}
      <div role="tablist" className="flex items-center gap-1 border-b border-line">
        {(['stats', 'logs', 'inspect'] as Tab[]).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t)}
              className={
                active
                  ? 'relative px-3 py-2 text-sm text-ink font-medium capitalize after:absolute after:left-3 after:right-3 after:bottom-[-1px] after:h-0.5 after:bg-accent after:rounded-full'
                  : 'px-3 py-2 text-sm text-muted hover:text-ink capitalize transition-colors duration-[var(--dur-micro)]'
              }
            >
              {t}
            </button>
          );
        })}
      </div>

      {tab === 'stats' && <StatsCharts id={id} />}
      {tab === 'logs' && <LogTerminal id={id} />}
      {tab === 'inspect' && (
        <div className="bg-panel border border-line rounded-card overflow-hidden">
          <pre className="text-xs mono text-muted whitespace-pre-wrap break-words p-4 max-h-[calc(100vh-24rem)] overflow-y-auto">
            {inspect ? JSON.stringify(inspect, null, 2) : 'Loading…'}
          </pre>
        </div>
      )}
    </div>
  );
}

interface SmallMetricProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  sub: string;
}

function SmallMetric({ label, icon, value, sub }: SmallMetricProps) {
  return (
    <div className="bg-panel border border-line rounded-card p-4 space-y-3 min-h-[120px] flex flex-col">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted uppercase tracking-[0.08em]">
          {label}
        </span>
        <span className="text-muted">{icon}</span>
      </div>
      <div className="flex items-baseline gap-1.5 tabular">
        <span className="text-2xl text-heading tracking-tight font-semibold">{value}</span>
      </div>
      <div className="text-[11px] text-muted mt-auto leading-relaxed">{sub}</div>
    </div>
  );
}