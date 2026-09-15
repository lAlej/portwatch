import { useEffect, useRef } from 'react';
import type { DeploymentStatus } from '@/shared/lib/schemas';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { X } from 'lucide-react';
import { useProjects } from './store';

interface Props {
  deploymentId: string;
  onClose: () => void;
}

const STATUS_LABEL: Record<DeploymentStatus, string> = {
  queued: 'Queued',
  pulling: 'Pulling latest changes…',
  building: 'Building images…',
  starting: 'Starting containers…',
  success: 'Deploy succeeded',
  failed: 'Deploy failed',
  cancelled: 'Deploy cancelled',
};

export function DeployLogModal({ deploymentId, onClose }: Props) {
  const deploy = useProjects((s) => s.deploys[deploymentId]);
  const subscribe = useProjects((s) => s.subscribeDeploy);
  const closeDeploy = useProjects((s) => s.closeDeploy);
  const tailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!deploy) return;
    return subscribe(deploymentId, deploy.projectId);
  }, [deploymentId, deploy, subscribe]);

  useEffect(() => {
    const el = tailRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [deploy?.logs.length]);

  if (!deploy) return null;

  const isRunning =
    deploy.status === 'queued' ||
    deploy.status === 'pulling' ||
    deploy.status === 'building' ||
    deploy.status === 'starting';

  return (
    <div
      className="
        fixed bottom-4 right-4 z-[var(--z-modal)]
        w-[640px] max-w-[calc(100vw-2rem)]
        h-[420px] max-h-[60vh]
        bg-panel rounded-card border border-line
        shadow-[0_8px_24px_oklch(20%_0.01_60/0.18)]
        overflow-hidden flex flex-col
      "
      role="dialog"
      aria-modal="false"
      aria-label="Deploy log"
    >
      <header className="px-3 py-2 border-b border-line flex items-center gap-2 bg-panel/95">
        <h2 className="text-xs font-semibold text-ink flex items-center gap-2 truncate">
          {isRunning && <Spinner size={10} />}
          <span className="truncate">{STATUS_LABEL[deploy.status]}</span>
        </h2>
        {deploy.exitCode !== null && (
          <span className="text-[10px] text-muted mono shrink-0">
            exit {deploy.exitCode}
            {deploy.error ? ` — ${deploy.error}` : ''}
          </span>
        )}
        <div className="ml-auto shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              closeDeploy(deploymentId);
              onClose();
            }}
          >
            <X size={12} />
            Close
          </Button>
        </div>
      </header>
      <div
        ref={tailRef}
        className="
          flex-1 overflow-auto bg-paper
          font-mono text-[11px] leading-snug
          px-3 py-2
        "
      >
        {deploy.logs.length === 0 ? (
          <p className="text-muted">Waiting for output…</p>
        ) : (
          deploy.logs.map((l, i) => (
            <div
              key={i}
              className={
                l.stream === 'stderr'
                  ? 'text-state-error whitespace-pre-wrap break-words'
                  : 'text-ink whitespace-pre-wrap break-words'
              }
            >
              {l.line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
