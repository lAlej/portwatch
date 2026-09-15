import type { Project, DeploymentStatus } from '@/shared/lib/schemas';
import { Button, IconButton } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { Trash2, RotateCw, KeyRound } from 'lucide-react';

interface Props {
  project: Project;
  lastStatus: DeploymentStatus | undefined;
  deploying: boolean;
  onDeploy: () => void;
  onDelete: () => void;
  onEditEnv: () => void;
}

const STATUS_LABEL: Record<DeploymentStatus, string> = {
  queued: 'queued',
  pulling: 'pulling',
  building: 'building',
  starting: 'starting',
  success: 'deployed',
  failed: 'failed',
  cancelled: 'cancelled',
};

const STATUS_TONE: Record<
  DeploymentStatus,
  'ok' | 'warn' | 'err' | 'muted' | 'info'
> = {
  queued: 'muted',
  pulling: 'info',
  building: 'info',
  starting: 'info',
  success: 'ok',
  failed: 'err',
  cancelled: 'warn',
};

export function ProjectCard({
  project,
  lastStatus,
  deploying,
  onDeploy,
  onDelete,
  onEditEnv,
}: Props) {
  const tone = lastStatus ? STATUS_TONE[lastStatus] : 'muted';
  const label = lastStatus ? STATUS_LABEL[lastStatus] : 'never deployed';

  return (
    <div
      className="
        bg-panel rounded-card border border-line p-4
        flex items-start gap-4
      "
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-semibold text-ink truncate">
            {project.name}
          </h3>
          <Badge tone={tone}>{label}</Badge>
          {project.envVars.length > 0 && (
            <span
              className="text-[10px] mono text-muted"
              title={`${project.envVars.length} env var(s) configured`}
            >
              · {project.envVars.length} env
            </span>
          )}
        </div>
        <p className="text-xs text-muted mono break-all">{project.cloneUrl}</p>
        <p className="text-xs text-muted mono mt-0.5">
          {project.composeFile
            ? `compose: ${project.composeFile}`
            : project.hasDockerfile
              ? 'Dockerfile only (no compose)'
              : ''}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          variant="primary"
          size="sm"
          onClick={onDeploy}
          disabled={deploying}
        >
          <RotateCw size={12} className={deploying ? 'animate-spin' : ''} />
          {deploying ? 'Deploying…' : 'Pull & deploy'}
        </Button>
        <IconButton
          onClick={onEditEnv}
          aria-label={`Edit env vars for ${project.name}`}
          title="Edit env vars"
        >
          <KeyRound size={14} />
        </IconButton>
        <IconButton
          onClick={onDelete}
          aria-label={`Delete project ${project.name}`}
          title="Delete project"
          danger
        >
          <Trash2 size={14} />
        </IconButton>
      </div>
    </div>
  );
}
