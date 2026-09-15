/* Hallmark · genre: modern-minimal · action strip: icon buttons in a row */

import { Play, RotateCw, Hammer, Pause, Trash2 } from 'lucide-react';
import type { Container } from '@/shared/lib/schemas';
import { useContainers } from './store';
import { useProjects } from '@/features/projects/store';
import { IconButton } from '@/shared/ui/Button';

interface Props {
  container: Container;
  size?: 'sm' | 'md';
}

export function ContainerActions({ container: c, size = 'sm' }: Props) {
  const { start, pause, unpause, restart, kill } = useContainers();
  const triggerDeploy = useProjects((s) => s.triggerDeploy);
  const activeDeployId = useProjects((s) => s.activeDeployId);
  const deploys = useProjects((s) => s.deploys);
  const projectId = useContainers((s) => s.projectFor.get(c.id));

  const deployingThis = projectId
    ? Object.values(deploys).some(
        (d) =>
          d.projectId === projectId &&
          (d.status === 'queued' ||
            d.status === 'pulling' ||
            d.status === 'building' ||
            d.status === 'starting'),
      )
    : false;

  const anyDeployRunning = activeDeployId !== null;

  const label = (text: string, icon: React.ReactNode) =>
    size === 'md' ? (
      <>
        {icon}
        <span>{text}</span>
      </>
    ) : (
      icon
    );

  const wrapperClass =
    size === 'md'
      ? 'flex items-center gap-2 flex-wrap'
      : 'flex justify-end items-center';

  const Md = ({
    children,
    onClick,
    disabled,
    title,
    danger,
  }: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    title?: string;
    danger?: boolean;
  }) => {
    if (size === 'md') {
      return (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          title={title}
          className={
            'inline-flex items-center gap-1.5 h-8 px-3 rounded-pill text-xs font-medium ' +
            'transition-colors duration-[var(--dur-micro)] ease-out ' +
            'disabled:opacity-40 disabled:cursor-not-allowed ' +
            (danger
              ? 'text-state-error hover:bg-state-error/10 border border-line'
              : 'bg-panel border border-line text-ink hover:bg-raised')
          }
        >
          {children}
        </button>
      );
    }
    return (
      <IconButton onClick={onClick} disabled={disabled} title={title} danger={danger}>
        {children}
      </IconButton>
    );
  };

  return (
    <div className={wrapperClass}>
      {/* "Rebuild & up" */}
      {projectId !== undefined && projectId !== null && (
        <Md
          onClick={() => void triggerDeploy(projectId)}
          disabled={deployingThis || anyDeployRunning}
          title={deployingThis ? 'Deploy already running' : 'Rebuild & up'}
        >
          <Hammer size={size === 'md' ? 12 : 15} className={deployingThis ? 'animate-pulse-live' : ''} />
          {size === 'md' && <span>Rebuild &amp; up</span>}
        </Md>
      )}

      {c.state === 'running' && (
        <>
          <Md
            onClick={() => void pause(c.id)}
            disabled={anyDeployRunning}
            title="Pause"
          >
            {label('Pause', <Pause size={size === 'md' ? 12 : 15} />)}
          </Md>
          <Md
            onClick={() => void restart(c.id)}
            disabled={anyDeployRunning}
            title="Restart"
          >
            {label('Restart', <RotateCw size={size === 'md' ? 12 : 15} />)}
          </Md>
          <Md
            onClick={() => void kill(c.id)}
            disabled={anyDeployRunning}
            title="Kill"
            danger
          >
            {label('Kill', <Trash2 size={size === 'md' ? 12 : 15} />)}
          </Md>
        </>
      )}
      {c.state === 'paused' && (
        <Md
          onClick={() => void unpause(c.id)}
          disabled={anyDeployRunning}
          title="Resume"
        >
          {label('Resume', <Play size={size === 'md' ? 12 : 15} />)}
        </Md>
      )}
      {(c.state === 'exited' || c.state === 'created') && (
        <Md
          onClick={() => void start(c.id)}
          disabled={anyDeployRunning}
          title="Start"
        >
          {label('Start', <Play size={size === 'md' ? 12 : 15} />)}
        </Md>
      )}
      {c.state === 'restarting' && (
        <Md
          onClick={() => void kill(c.id)}
          disabled={anyDeployRunning}
          title="Kill"
          danger
        >
          {label('Kill', <Trash2 size={size === 'md' ? 12 : 15} />)}
        </Md>
      )}
    </div>
  );
}
