/* Hallmark · genre: modern-minimal · table: dense, hairline rules, no row borders-on-hover
   · extras: grouping by compose project + hidden-containers banner */

import { useEffect, useMemo, useState } from 'react';
import { Container, ChevronDown, Rows3, List } from 'lucide-react';
import { clsx } from 'clsx';
import { useContainers } from './store';
import { ContainerRow } from './ContainerRow';
import type { Container as ContainerType } from '@/shared/lib/schemas';

type ViewMode = 'flat' | 'grouped';
const VIEW_KEY = 'portwatch:containers:view';

function readView(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'grouped' ? 'grouped' : 'flat';
  } catch {
    return 'flat';
  }
}

function writeView(v: ViewMode): void {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* ignore */
  }
}

interface ProjectGroup {
  project: string;
  isStandalone: boolean;
  containers: ContainerType[];
  running: number;
}

function groupByProject(items: ContainerType[]): ProjectGroup[] {
  const groups = new Map<string, ContainerType[]>();
  for (const c of items) {
    const project = c.labels?.['com.docker.compose.project'];
    const key = project ?? '__standalone__';
    const bucket = groups.get(key);
    if (bucket) bucket.push(c);
    else groups.set(key, [c]);
  }

  const result: ProjectGroup[] = [];
  for (const [project, containers] of groups) {
    const isStandalone = project === '__standalone__';
    result.push({
      project: isStandalone ? 'standalone' : project,
      isStandalone,
      containers,
      running: containers.filter((c) => c.state === 'running').length,
    });
  }

  result.sort((a, b) => {
    if (a.isStandalone !== b.isStandalone) return a.isStandalone ? 1 : -1;
    return a.project.localeCompare(b.project);
  });
  return result;
}

export function ContainerTable() {
  const { items, loading, error, fetch } = useContainers();
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>(() => readView());

  useEffect(() => {
    void fetch().then(() => setUpdatedAt(Date.now()));
    const t = setInterval(() => {
      void fetch().then(() => setUpdatedAt(Date.now()));
    }, 5000);
    return () => clearInterval(t);
  }, [fetch]);

  const stale = updatedAt ? Date.now() - updatedAt > 12000 : true;
  const totalRunning = items.filter((c) => c.state === 'running').length;
  const groups = useMemo(() => groupByProject(items), [items]);

  return (
    <section className="bg-panel border border-line rounded-card overflow-hidden">
      <header className="flex items-center justify-between px-6 py-3 border-b border-line">
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>
            <span className="text-ink font-medium tabular">{items.length}</span> visible
          </span>
          <span className="text-line">·</span>
          <span>
            <span className="text-ink font-medium tabular">{totalRunning}</span> running
          </span>
          {view === 'grouped' && groups.length > 1 && (
            <>
              <span className="text-line">·</span>
              <span>
                <span className="text-ink font-medium tabular">{groups.length}</span> groups
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 mono text-[11px]">
          <ViewToggle
            value={view}
            onChange={(v) => {
              setView(v);
              writeView(v);
            }}
          />
        </div>
      </header>

      {error && (
        <div className="px-6 py-3 text-xs text-state-error border-b border-line">
          {error}
        </div>
      )}

      {view === 'flat' ? (
        <FlatTable items={items} loading={loading} />
      ) : (
        <GroupedView groups={groups} loading={loading} />
      )}

      <footer className="flex items-center justify-between px-6 py-3 border-t border-line text-xs text-muted">
        <span>
          Showing containers managed by other compose projects.{' '}
          <span className="text-ink">
            Containers of this dashboard are hidden.
          </span>
        </span>
        <div className="flex items-center gap-2 mono">
          <span
            className={clsx(
              'inline-block h-1.5 w-1.5 rounded-full',
              loading
                ? 'bg-accent animate-pulse-live'
                : stale
                  ? 'bg-line'
                  : 'bg-accent',
            )}
          />
          <span>
            {loading
              ? 'syncing'
              : updatedAt
                ? `synced ${formatAge(Date.now() - updatedAt)} ago`
                : 'idle'}
          </span>
        </div>
      </footer>
    </section>
  );
}

function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 1) return 'just now';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

function FlatTable({ items, loading }: { items: ContainerType[]; loading: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.08em] text-muted">
            <th className="pl-6 pr-3 py-2.5 text-left font-medium">Name</th>
            <th className="px-3 py-2.5 text-left font-medium">Image</th>
            <th className="px-3 py-2.5 text-left font-medium">State</th>
            <th className="px-3 py-2.5 text-left font-medium">Ports</th>
            <th className="pr-6 pl-3 py-2.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.length === 0 && !loading && <EmptyRow />}
          {items.map((c) => (
            <ContainerRow key={c.id} c={c} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupedView({
  groups,
  loading,
}: {
  groups: ProjectGroup[];
  loading: boolean;
}) {
  if (groups.length === 0 && !loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="py-16">
                <EmptyState />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="divide-y divide-line">
      {groups.map((g) => (
        <ProjectSection key={g.project} group={g} />
      ))}
    </div>
  );
}

function ProjectSection({ group }: { group: ProjectGroup }) {
  return (
    <details open={!group.isStandalone} className="group/project">
      <summary
        className="
          flex items-center gap-3 px-6 py-3
          cursor-pointer select-none
          hover:bg-raised/50
          transition-colors duration-[var(--dur-micro)]
          list-none
          [&::-webkit-details-marker]:hidden
        "
      >
        <ChevronDown
          size={14}
          className="
            text-muted
            transition-transform duration-[var(--dur-short)] ease-out
            group-open/project:rotate-0 rotate-[-90deg]
          "
        />
        <span className="font-medium text-ink text-sm">
          {group.isStandalone ? 'standalone' : group.project}
        </span>
        <span className="text-[11px] uppercase tracking-[0.08em] text-muted mono">
          {group.isStandalone ? 'no compose label' : 'compose project'}
        </span>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted mono">
          <span>
            <span className="text-ink tabular">{group.running}</span>
            <span>/{group.containers.length}</span> running
          </span>
        </div>
      </summary>
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {group.containers.map((c) => (
              <ContainerRow key={c.id} c={c} />
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function EmptyRow() {
  return (
    <tr>
      <td colSpan={5} className="py-20 text-center">
        <EmptyState />
      </td>
    </tr>
  );
}

function EmptyState() {
  return (
    <div className="inline-flex flex-col items-center gap-3 text-muted">
      <Container size={20} className="opacity-50" />
      <div>
        <div className="text-ink text-sm">No containers running.</div>
        <div className="mono text-xs mt-1.5">
          <span className="text-accent">$</span> docker run hello-world
        </div>
      </div>
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="View mode"
      className="inline-flex items-center rounded-pill border border-line bg-paper p-0.5"
    >
      <ToggleButton
        active={value === 'flat'}
        onClick={() => onChange('flat')}
        title="Flat list"
      >
        <List size={12} />
        <span>Flat</span>
      </ToggleButton>
      <ToggleButton
        active={value === 'grouped'}
        onClick={() => onChange('grouped')}
        title="Grouped by compose project"
      >
        <Rows3 size={12} />
        <span>Grouped</span>
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 h-6 px-2.5 rounded-pill text-[11px] mono',
        'transition-colors duration-[var(--dur-micro)]',
        active ? 'bg-raised text-ink' : 'text-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}