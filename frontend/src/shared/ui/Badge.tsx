/* Hallmark · genre: modern-minimal · pill badge con tonos por semantica */

import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import type { ContainerState } from '@/shared/lib/schemas';

export type BadgeTone = 'ok' | 'warn' | 'err' | 'muted' | 'info';

interface Props {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  ok: 'text-state-running bg-state-running/10',
  warn: 'text-state-paused bg-state-paused/10',
  err: 'text-state-error bg-state-error/10',
  muted: 'text-muted bg-raised',
  info: 'text-accent bg-accent/10',
};

export function Badge({ tone = 'muted', children, className }: Props) {
  return (
    <span
      className={clsx(
        'inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-medium mono uppercase tracking-wide',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATE_TONE: Record<ContainerState, BadgeTone> = {
  running: 'ok',
  paused: 'warn',
  restarting: 'info',
  exited: 'muted',
  created: 'muted',
  dead: 'err',
  removing: 'muted',
  unknown: 'muted',
};

const STATE_LABEL: Record<ContainerState, string> = {
  running: 'running',
  paused: 'paused',
  restarting: 'restarting',
  exited: 'exited',
  created: 'created',
  dead: 'dead',
  removing: 'removing',
  unknown: 'unknown',
};

export function StatePill({ state }: { state: ContainerState }) {
  return <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge>;
}

const STATE_DOT_COLOR: Record<ContainerState, string> = {
  running: 'bg-state-running',
  paused: 'bg-state-paused',
  restarting: 'bg-state-paused',
  exited: 'bg-muted',
  created: 'bg-muted',
  dead: 'bg-state-error',
  removing: 'bg-muted',
  unknown: 'bg-muted',
};

export function StateDot({ state }: { state: ContainerState }) {
  return (
    <span
      aria-hidden
      className={clsx(
        'inline-block h-2 w-2 rounded-full',
        STATE_DOT_COLOR[state],
      )}
    />
  );
}
