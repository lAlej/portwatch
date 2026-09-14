/* Hallmark · genre: modern-minimal · dashboard: bento + table */

import { SystemCards } from '@/features/stats/SystemCards';
import { ContainerTable } from '@/features/containers/ContainerTable';

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <header className="reveal" style={{ ['--i' as string]: 0 }}>
        <h1 className="text-text-2xl text-heading tracking-tight font-semibold">
          Containers
        </h1>
        <p className="text-sm text-muted mt-1">
          Host status and per-container controls.
        </p>
      </header>

      <div className="reveal" style={{ ['--i' as string]: 1 }}>
        <SystemCards />
      </div>

      <div className="reveal" style={{ ['--i' as string]: 2 }}>
        <ContainerTable />
      </div>
    </div>
  );
}