import { useState, type FormEvent } from 'react';
import { AlertTriangle, FilePlus2 } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import type { EnvVar } from '@/shared/lib/schemas';
import { useProjects } from './store';
import { EnvVarsEditor } from './EnvVarsEditor';

interface Props {
  onCreated?: () => void;
}

const PLACEHOLDER = `services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
`;

export function AddComposeProjectForm({ onCreated }: Props) {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createAdHoc = useProjects((s) => s.createAdHoc);

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedContent = content;
    if (!trimmedName || !trimmedContent.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createAdHoc(trimmedName, trimmedContent, envVars);
      setName('');
      setContent('');
      setEnvVars([]);
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    !busy && name.trim().length > 0 && content.trim().length > 0;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <label
          htmlFor="adhoc-name"
          className="block text-xs text-muted mb-1.5 font-medium"
        >
          Project name
        </label>
        <input
          id="adhoc-name"
          type="text"
          spellCheck={false}
          autoComplete="off"
          placeholder="gluetun"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          className="
            w-full h-9 px-3 rounded-input bg-paper border border-line
            text-sm text-ink placeholder:text-muted
            focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20
            transition-colors duration-[var(--dur-micro)]
          "
        />
        <p className="mt-1 text-[11px] text-muted leading-relaxed">
          Will be sanitized to <span className="mono">a-z 0-9 _ -</span>. Container
          project label becomes <span className="mono">com.docker.compose.project=&lt;name&gt;</span>.
        </p>
      </div>

      <div>
        <label
          htmlFor="adhoc-content"
          className="block text-xs text-muted mb-1.5 font-medium"
        >
          Compose file
        </label>
        <textarea
          id="adhoc-content"
          value={content}
          onChange={(e): void => setContent(e.target.value)}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          wrap="off"
          placeholder={PLACEHOLDER}
          className="
            w-full min-h-[200px]
            mono text-xs leading-relaxed
            bg-paper border border-line rounded-input p-3
            text-ink placeholder:text-muted
            focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20
            resize-y
          "
          aria-label="Compose file content"
        />
      </div>

      <EnvVarsEditor value={envVars} onChange={setEnvVars} disabled={busy} />

      {error && (
        <div className="flex items-start gap-2 text-xs text-state-error mono break-words bg-state-error/5 border border-state-error/20 rounded-input p-3">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <Button
          type="submit"
          variant="primary"
          disabled={!canSubmit}
        >
          <FilePlus2 size={12} />
          {busy ? 'Creating…' : 'Create & start'}
        </Button>
      </div>
    </form>
  );
}