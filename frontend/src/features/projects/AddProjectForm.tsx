import { useState, type FormEvent } from 'react';
import { Button } from '@/shared/ui/Button';
import type { EnvVar } from '@/shared/lib/schemas';
import { useProjects } from './store';
import { EnvVarsEditor } from './EnvVarsEditor';

export function AddProjectForm() {
  const [url, setUrl] = useState('');
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = useProjects((s) => s.add);

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await add(url.trim(), envVars);
      setUrl('');
      setEnvVars([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add project');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <label
          htmlFor="clone-url"
          className="block text-xs text-muted mb-1.5 font-medium"
        >
          Clone URL
        </label>
        <input
          id="clone-url"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://github.com/owner/repo.git  or  git@github.com:owner/repo.git"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
          className="
            w-full h-9 px-3 rounded-input bg-paper border border-line
            text-sm text-ink placeholder:text-muted
            focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20
            transition-colors duration-[var(--dur-micro)]
          "
        />
        {error && (
          <p className="mt-1.5 text-xs text-state-error mono break-words">
            {error}
          </p>
        )}
      </div>

      <EnvVarsEditor value={envVars} onChange={setEnvVars} disabled={busy} />

      <div>
        <Button
          type="submit"
          variant="primary"
          disabled={busy || !url.trim()}
        >
          {busy ? 'Cloning…' : 'Clone & add'}
        </Button>
      </div>
    </form>
  );
}
