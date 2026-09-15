/* Hallmark · genre: modern-minimal · row: clean, square icon buttons, no side-stripe */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Container } from '@/shared/lib/schemas';
import { StatePill } from '@/shared/ui/Badge';
import { useContainers } from './store';
import { ContainerActions } from './ContainerActions';

interface Props {
  c: Container;
}

export function ContainerRow({ c }: Props) {
  const resolveProject = useContainers((s) => s.resolveProject);

  useEffect(() => {
    if (!useContainers.getState().projectFor.has(c.id)) {
      void resolveProject(c.id);
    }
  }, [c.id, resolveProject]);

  return (
    <tr className="group hover:bg-raised/60 transition-colors duration-[var(--dur-micro)]">
      <td className="pl-6 pr-3 py-3.5 align-middle">
        <Link
          to={`/containers/${c.id}`}
          className="flex items-center gap-3 group/link"
        >
          <span
            className="
              grid place-items-center h-7 w-7 rounded-md
              bg-raised text-muted group-hover/link:text-ink group-hover/link:bg-paper
              transition-colors duration-[var(--dur-micro)]
            "
          >
            <ContainerGlyph />
          </span>
          <span className="font-medium text-ink group-hover/link:text-accent transition-colors duration-[var(--dur-micro)] truncate">
            {c.name}
          </span>
        </Link>
      </td>
      <td className="px-3 py-3.5 align-middle mono text-xs text-muted max-w-[16rem]">
        <span className="block truncate" title={c.image}>{c.image}</span>
      </td>
      <td className="px-3 py-3.5 align-middle">
        <StatePill state={c.state} />
      </td>
      <td className="px-3 py-3.5 align-middle mono text-xs text-muted whitespace-nowrap">
        {c.ports.length === 0 ? (
          <span className="text-line">—</span>
        ) : (
          c.ports.slice(0, 3).map((p, i) => (
            <span key={i}>
              <span className="text-ink">{(p.publicPort ?? '-')}</span>
              <span className="text-muted">:{p.privatePort}</span>
              {i < Math.min(c.ports.length, 3) - 1 ? '  ' : ''}
            </span>
          ))
        )}
      </td>
      <td className="pr-6 pl-3 py-3.5 align-middle">
        <ContainerActions container={c} size="sm" />
      </td>
    </tr>
  );
}

/* small geometric container glyph */
function ContainerGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="4" width="12" height="9" rx="1.5" />
      <path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
    </svg>
  );
}