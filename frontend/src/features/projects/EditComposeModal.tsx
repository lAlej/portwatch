import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Save, X } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { useProjects } from './store';

interface Props {
  projectId: string;
  composeFile: string;
  label: string;
  onClose: () => void;
}

// Save -> PUT /api/projects/:id/compose -> backend writes file and
// runs `docker compose up -d --force-recreate`. No git commit.
export function EditComposeModal({
  projectId,
  composeFile,
  label,
  onClose,
}: Props) {
  const navigate = useNavigate();
  const loadCompose = useProjects((s) => s.loadCompose);
  const saveCompose = useProjects((s) => s.saveCompose);
  const composeLoading = useProjects((s) => s.composeLoading[projectId] ?? false);

  const [content, setContent] = useState<string>('');
  const [original, setOriginal] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const dirty = content !== original;

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    void loadCompose(projectId, composeFile)
      .then((c) => {
        if (cancelled) return;
        setContent(c.content);
        setOriginal(c.content);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load compose file');
      });
    return (): void => {
      cancelled = true;
    };
  }, [projectId, composeFile, loadCompose]);

  const requestClose = (): void => {
    if (busy) return;
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    onClose();
  };

  const onSave = async (): Promise<void> => {
    if (!dirty || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await saveCompose(projectId, content, composeFile);
      if (result.exitCode !== 0) {
        // File is already on disk; force-recreate failed. Keep modal open
        // so the user can inspect and retry.
        setError(result.error ?? 'docker compose up failed');
        setBusy(false);
        return;
      }
      onClose();
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save compose file');
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] grid place-items-center bg-ink/30 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-compose-title"
    >
      <div className="bg-panel rounded-card border border-line w-full max-w-4xl shadow-lg overflow-hidden flex flex-col max-h-[85vh]">
        <header className="px-4 py-3 border-b border-line flex items-center gap-3">
          <h2
            id="edit-compose-title"
            className="text-sm font-semibold text-ink truncate"
          >
            Edit compose · {label}
          </h2>
          <span className="text-xs text-muted mono truncate">{composeFile}</span>
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={requestClose} disabled={busy}>
              <X size={12} />
              Close
            </Button>
          </div>
        </header>

        <div className="p-4 flex-1 min-h-0 flex flex-col gap-3">
          {loadError ? (
            <div className="flex items-start gap-2 text-xs text-state-error mono break-words bg-state-error/5 border border-state-error/20 rounded-input p-3">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{loadError}</span>
            </div>
          ) : composeLoading && !original ? (
            <p className="text-xs text-muted">Loading compose file…</p>
          ) : (
            <textarea
              value={content}
              onChange={(e): void => setContent(e.target.value)}
              disabled={busy || loadError !== null}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              wrap="off"
              className="
                flex-1 min-h-[420px] w-full
                mono text-xs leading-relaxed
                bg-paper border border-line rounded-input p-3
                text-ink placeholder:text-muted
                focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20
                resize-none
              "
              aria-label="Compose file content"
            />
          )}

          {error && (
            <div className="flex items-start gap-2 text-xs text-state-error mono break-words bg-state-error/5 border border-state-error/20 rounded-input p-3">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-xs text-muted leading-relaxed">
            Saving will overwrite <span className="mono">{composeFile}</span> on the host and
            run <span className="mono">docker compose up -d --force-recreate</span> —
            containers will restart with the new config (no image rebuild).
          </p>
        </div>

        <footer className="px-4 py-3 border-t border-line flex items-center justify-between gap-2">
          <div className="text-xs text-muted">
            {dirty ? (
              <span className="text-state-warning">Unsaved changes</span>
            ) : (
              <span>No changes</span>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={requestClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onSave}
              disabled={busy || !dirty || loadError !== null}
            >
              <Save size={12} />
              {busy ? 'Saving & restarting…' : 'Save and restart'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}