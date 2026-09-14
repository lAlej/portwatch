/* Hallmark · genre: modern-minimal · state pill: ink-tinted, no chromatic floods */

import { clsx } from 'clsx';
import type { ContainerState } from '@/shared/lib/schemas';

interface StateStyle {
  dot: string;
  text: string;
  pill: string;
}

const STYLE: Record<ContainerState, StateStyle> = {
  running: {
    dot:  'bg-state-running',
    text: 'text-state-running',
    pill: 'bg-state-running/10 text-state-running ring-1 ring-state-running/25',
  },
  paused: {
    dot:  'bg-state-paused',
    text: 'text-state-paused',
    pill: 'bg-state-paused/10 text-state-paused ring-1 ring-state-paused/25',
  },
  restarting: {
    dot:  'bg-state-restarting',
    text: 'text-state-restarting',
    pill: 'bg-state-restarting/10 text-state-restarting ring-1 ring-state-restarting/25',
  },
  exited: {
    dot:  'bg-muted/60',
    text: 'text-muted',
    pill: 'bg-raised text-muted ring-1 ring-line',
  },
  created: {
    dot:  'bg-state-restarting',
    text: 'text-state-restarting',
    pill: 'bg-state-restarting/10 text-state-restarting ring-1 ring-state-restarting/25',
  },
  dead: {
    dot:  'bg-state-error',
    text: 'text-state-error',
    pill: 'bg-state-error/10 text-state-error ring-1 ring-state-error/25',
  },
  removing: {
    dot:  'bg-state-error/70',
    text: 'text-state-error',
    pill: 'bg-state-error/10 text-state-error ring-1 ring-state-error/25',
  },
  unknown: {
    dot:  'bg-muted',
    text: 'text-muted',
    pill: 'bg-raised text-muted ring-1 ring-line',
  },
};

interface DotProps {
  state: ContainerState;
  showLabel?: boolean;
}

export function StateDot({ state, showLabel = true }: DotProps) {
  const s = STYLE[state];
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className={clsx('inline-block h-1.5 w-1.5 rounded-full', s.dot)} />
      {showLabel && <span className={clsx(s, 'font-medium tracking-wide')}>{state}</span>}
    </span>
  );
}

interface PillProps {
  state: ContainerState;
}

export function StatePill({ state }: PillProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11px] font-medium',
        STYLE[state].pill,
      )}
    >
      {state}
    </span>
  );
}

export function stateBorderClass(_state: ContainerState): string {
  return ''; // side-stripe card removed in redesign — see design.md § anti-patterns
}