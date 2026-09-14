/* Hallmark · genre: modern-minimal · table: dense, hairline rules, no row borders-on-hover */

import { useEffect, useState } from 'react';
import { Container } from 'lucide-react';
import { useContainers } from './store';
import { ContainerRow } from './ContainerRow';

export function ContainerTable() {
  const { items, loading, error, fetch } = useContainers();
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    void fetch().then(() => setUpdatedAt(Date.now()));
    const t = setInterval(() => {
      void fetch().then(() => setUpdatedAt(Date.now()));
    }, 5000);
    return () => clearInterval(t);
  }, [fetch]);

  const stale = updatedAt ? Date.now() - updatedAt > 12000 : true;

  return (
    <section className="bg-panel border border-line rounded-card overflow-hidden">
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
            {items.length === 0 && !loading && !error && (
              <tr>
                <td colSpan={5} className="py-20 text-center">
                  <div className="inline-flex flex-col items-center gap-3 text-muted">
                    <Container size={20} className="opacity-50" />
                    <div>
                      <div className="text-ink text-sm">No containers running.</div>
                      <div className="mono text-xs mt-1.5">
                        <span className="text-accent">$</span> docker run hello-world
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {items.map((c) => (
              <ContainerRow key={c.id} c={c} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-6 py-3 border-t border-line text-xs text-muted">
        <div>
          {items.length} total ·{' '}
          <span className="text-ink">{items.filter((c) => c.state === 'running').length}</span> running
        </div>
        <div className="flex items-center gap-2 mono">
          <span
            className={
              loading
                ? 'inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse-live'
                : stale
                  ? 'inline-block h-1.5 w-1.5 rounded-full bg-line'
                  : 'inline-block h-1.5 w-1.5 rounded-full bg-accent'
            }
          />
          <span>
            {loading
              ? 'syncing'
              : updatedAt
                ? `synced ${formatAge(Date.now() - updatedAt)} ago`
                : 'idle'}
          </span>
        </div>
      </div>
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