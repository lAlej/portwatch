/* Hallmark · genre: modern-minimal · log terminal: paper surface, hairline border */

import { useEffect, useRef } from 'react';
import { LogLineSchema, type LogLine } from '@/shared/lib/schemas';
import { getSocket } from '@/shared/lib/ws';
import { useLogs } from './store';
import { clsx } from 'clsx';

type Level = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'TRACE' | 'FATAL';

const LEVEL_CLASSES: Record<Level, string> = {
  INFO:  'text-state-running',
  WARN:  'text-state-paused',
  ERROR: 'text-state-error',
  DEBUG: 'text-heading',
  TRACE: 'text-muted',
  FATAL: 'text-state-error',
};

const HTTP_LEVEL_RE = /" (1\d{2}|2\d{2}|3\d{2}|4\d{2}|5\d{2}) /;

function detectLevel(line: LogLine): Level {
  if (line.stream === 'stderr') {
    const lower = line.data.toLowerCase();
    if (lower.includes('fatal') || lower.includes('panic')) return 'FATAL';
    if (lower.includes('error') || lower.includes('err') || lower.includes('fail')) return 'ERROR';
    return 'WARN';
  }
  const trimmed = line.data.trimStart();
  const firstWord = trimmed.split(/\s+/)[0]?.toUpperCase() ?? '';
  if (['INFO', 'WARN', 'WARNING', 'ERROR', 'ERR', 'DEBUG', 'TRACE', 'FATAL'].includes(firstWord)) {
    if (firstWord === 'WARNING') return 'WARN';
    if (firstWord === 'ERR') return 'ERROR';
    return firstWord as Level;
  }
  const httpMatch = line.data.match(HTTP_LEVEL_RE);
  if (httpMatch) {
    const code = Number(httpMatch[1]);
    if (code >= 500) return 'ERROR';
    if (code >= 400) return 'WARN';
    return 'INFO';
  }
  return 'INFO';
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function sanitize(text: string): string {
  return text
    .replace(/\uFFFD/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

interface Props {
  id: string;
  tail?: number;
}

export function LogTerminal({ id, tail = 200 }: Props) {
  const lines = useLogs((s) => s.lines);
  const clear = useLogs((s) => s.clear);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    clear();
    const socket = getSocket();
    const channel = `container:logs:${id}`;
    const onLine = (raw: unknown) => {
      const parsed = LogLineSchema.safeParse(raw);
      if (parsed.success) useLogs.getState().push(parsed.data);
    };
    socket.on(channel, onLine);
    socket.emit('subscribe', { channel: 'container:logs', id, tail });

    return () => {
      socket.emit('unsubscribe', { channel: 'container:logs', id });
      socket.off(channel, onLine);
      clear();
    };
  }, [id, tail, clear]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines.length]);

  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    stickToBottom.current = distanceFromBottom < 40;
  };

  const visible = lines.slice(-500);

  return (
    <div className="bg-paper border border-line rounded-card overflow-hidden">
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="h-[60vh] overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-5"
      >
        {visible.length === 0 ? (
          <div className="grid place-items-center h-full text-muted text-sm">
            Waiting for logs…
          </div>
        ) : (
          visible.map((l, i) => <LogRow key={l.id + '-' + i} line={l} />)
        )}
      </div>
    </div>
  );
}

function LogRow({ line }: { line: LogLine }) {
  const level = detectLevel(line);
  const raw = line.data.endsWith('\n') ? line.data.slice(0, -1) : line.data;
  const text = sanitize(raw);
  return (
    <div className="flex items-start gap-3 px-3 py-2 mb-1.5 rounded-md border border-line bg-raised hover:shadow-sm transition-shadow duration-[var(--dur-micro)]">
      <span className="shrink-0 tabular text-muted">{formatTime(line.timestamp)}</span>
      <span
        className={clsx(
          'shrink-0 inline-flex items-center justify-center min-w-[58px] px-2 py-0.5 rounded-pill text-[10.5px] font-medium tracking-wide uppercase',
          LEVEL_CLASSES[level],
        )}
        style={{ background: 'var(--color-raised)' }}
      >
        {level}
      </span>
      <span className="whitespace-pre-wrap break-words text-ink">{text}</span>
    </div>
  );
}