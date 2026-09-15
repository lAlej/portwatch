import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import type { Project, EnvVar } from '@/shared/lib/schemas';
import { useProjects } from './store';
import { EnvVarsEditor } from './EnvVarsEditor';

interface Props {
  project: Project;
  onClose: () => void;
}

export function EditEnvModal({ project, onClose }: Props) {
  const [vars, setVars] = useState<EnvVar[]>(project.envVars);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateEnv = useProjects((s) => s.updateEnv);

  useEffect(() => {
    setVars(project.envVars);
  }, [project.envVars]);

  const onSave = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await updateEnv(project.id, vars);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update env');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] grid place-items-center bg-ink/30 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-env-title"
    >
      <div className="bg-panel rounded-card border border-line w-full max-w-2xl shadow-lg overflow-hidden flex flex-col max-h-[80vh]">
        <header className="px-4 py-3 border-b border-line flex items-center gap-3">
          <h2
            id="edit-env-title"
            className="text-sm font-semibold text-ink"
          >
            Environment variables · {project.name}
          </h2>
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X size={12} />
              Close
            </Button>
          </div>
        </header>
        <div className="p-4 overflow-auto">
          <EnvVarsEditor value={vars} onChange={setVars} disabled={busy} />
          {error && (
            <p className="mt-3 text-xs text-state-error mono break-words">
              {error}
            </p>
          )}
          <p className="mt-3 text-xs text-muted">
            Edits take effect on the next deploy. The new <span className="mono">.env</span> is
            written to <span className="mono">{project.path}/.env</span> on the host.
          </p>
        </div>
        <footer className="px-4 py-3 border-t border-line flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onSave} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </footer>
      </div>
    </div>
  );
}
