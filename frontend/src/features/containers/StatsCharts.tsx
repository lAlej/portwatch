/* Hallmark · genre: modern-minimal · chart: monochrome cobalt, hairline grid, no fills */

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { getSocket } from '@/shared/lib/ws';
import { ContainerStatsSchema, type ContainerStats } from '@/shared/lib/schemas';
import { formatBytes, formatShortTime } from '@/shared/lib/format';

interface Point extends ContainerStats {
  t: string;
}

const INK        = 'oklch(38% 0.012 60)';
const ACCENT     = '#0046FF';
const ACCENT_SOFT= '#1a5cff';
const GRID       = 'oklch(91% 0.008 80)';
const MUTED      = 'oklch(55% 0.010 70)';

export function StatsCharts({ id }: { id: string }) {
  const [points, setPoints] = useState<Point[]>([]);
  const max = 60;

  useEffect(() => {
    const socket = getSocket();
    const channel = `container:stats:${id}`;
    const onSample = (raw: unknown) => {
      const parsed = ContainerStatsSchema.safeParse(raw);
      if (!parsed.success) return;
      const s = parsed.data;
      setPoints((prev) => {
        const next = [...prev, { ...s, t: formatShortTime(s.timestamp) }];
        if (next.length > max) next.shift();
        return next;
      });
    };
    socket.on(channel, onSample);
    socket.emit('subscribe', { channel: 'container:stats', id });
    return () => {
      socket.emit('unsubscribe', { channel: 'container:stats', id });
      socket.off(channel, onSample);
    };
  }, [id]);

  return (
    <div className="space-y-4">
      <Chart label="CPU %">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={GRID} vertical={false} />
            <XAxis dataKey="t" hide />
            <YAxis domain={[0, 100]} tick={{ fill: MUTED, fontSize: 11 }} width={32} />
            <Tooltip content={<DimTooltip suffix="%" />} />
            <Line type="monotone" dataKey="cpuPercent" stroke={ACCENT} strokeWidth={1.75} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Chart>

      <Chart label="Memory %">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={GRID} vertical={false} />
            <XAxis dataKey="t" hide />
            <YAxis domain={[0, 100]} tick={{ fill: MUTED, fontSize: 11 }} width={32} />
            <Tooltip content={<DimTooltip suffix="%" />} />
            <Line type="monotone" dataKey="memoryPercent" stroke={INK} strokeWidth={1.75} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Chart>

      <Chart label="Network bytes (cumulative)">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={GRID} vertical={false} />
            <XAxis dataKey="t" hide />
            <YAxis
              tick={{ fill: MUTED, fontSize: 11 }}
              width={48}
              tickFormatter={(v) => formatBytes(v as number)}
            />
            <Tooltip content={<DimTooltip />} />
            <Line type="monotone" dataKey="networkRxBytes" stroke={ACCENT} strokeWidth={1.75} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="networkTxBytes" stroke={ACCENT_SOFT} strokeWidth={1.75} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Chart>
    </div>
  );
}

function Chart({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-panel border border-line rounded-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted uppercase tracking-[0.08em]">
          {label}
        </span>
      </div>
      <div className="h-32">{children}</div>
    </section>
  );
}

interface TooltipPayload {
  value?: number | string;
  name?: string;
}

function DimTooltip({
  active,
  payload,
  label,
  suffix = '',
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-paper border border-line rounded-input px-3 py-2 mono text-[11px] shadow-[0_1px_2px_oklch(20%_0.01_60/0.06)]">
      {label && <div className="text-muted">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="text-ink">
          {p.name ?? ''} {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
          {suffix}
        </div>
      ))}
    </div>
  );
}