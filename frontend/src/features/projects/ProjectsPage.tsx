import { useEffect, useState } from 'react';
import { Card } from '@/shared/ui/Card';
import { Spinner } from '@/shared/ui/Spinner';
import type { Project } from '@/shared/lib/schemas';
import { useProjects } from './store';
import { AddProjectForm } from './AddProjectForm';
import { ProjectCard } from './ProjectCard';
import { EditEnvModal } from './EditEnvModal';

export function ProjectsPage() {
  const items = useProjects((s) => s.items);
  const loading = useProjects((s) => s.loading);
  const error = useProjects((s) => s.error);
  const lastStatusByProject = useProjects((s) => s.lastStatusByProject);
  const fetch = useProjects((s) => s.fetch);
  const triggerDeploy = useProjects((s) => s.triggerDeploy);
  const remove = useProjects((s) => s.remove);
  const deploys = useProjects((s) => s.deploys);

  const [editingEnv, setEditingEnv] = useState<Project | null>(null);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const onDeploy = async (projectId: string): Promise<void> => {
    try {
      await triggerDeploy(projectId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to trigger deploy', err);
    }
  };

  const onDelete = async (projectId: string): Promise<void> => {
    if (!confirm('Delete this project? The cloned directory will also be removed.'))
      return;
    try {
      await remove(projectId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete project', err);
    }
  };

  return (
    <div className="space-y-6">
      <header className="reveal" style={{ ['--i' as string]: 0 }}>
        <h1 className="text-text-2xl text-heading tracking-tight font-semibold">
          Projects
        </h1>
        <p className="text-sm text-muted mt-1">
          Clone a repo, then pull & deploy with one click.
        </p>
      </header>

      <div className="reveal" style={{ ['--i' as string]: 1 }}>
        <Card>
          <AddProjectForm />
        </Card>
      </div>

      <div className="reveal" style={{ ['--i' as string]: 2 }}>
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted">
            <Spinner size={16} />
            <span className="ml-2 text-sm">Loading projects…</span>
          </div>
        ) : error ? (
          <Card>
            <p className="text-sm text-state-error mono break-words">{error}</p>
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              No projects yet. Paste a clone URL above to add one.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                lastStatus={lastStatusByProject[p.id]}
                deploying={Object.values(deploys).some(
                  (d) =>
                    d.projectId === p.id &&
                    (d.status === 'queued' ||
                      d.status === 'pulling' ||
                      d.status === 'building' ||
                      d.status === 'starting'),
                )}
                onDeploy={() => void onDeploy(p.id)}
                onDelete={() => void onDelete(p.id)}
                onEditEnv={() => setEditingEnv(p)}
              />
            ))}
          </div>
        )}
      </div>

      {editingEnv && (
        <EditEnvModal
          project={editingEnv}
          onClose={() => setEditingEnv(null)}
        />
      )}
    </div>
  );
}
