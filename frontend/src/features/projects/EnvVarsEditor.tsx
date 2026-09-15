import { Plus, X } from 'lucide-react';
import type { EnvVar } from '@/shared/lib/schemas';

interface Props {
  value: EnvVar[];
  onChange: (next: EnvVar[]) => void;
  disabled?: boolean;
}

export function EnvVarsEditor({ value, onChange, disabled }: Props) {
  const updateAt = (idx: number, patch: Partial<EnvVar>): void => {
    const next = value.map((v, i) => (i === idx ? { ...v, ...patch } : v));
    onChange(next);
  };
  const removeAt = (idx: number): void => {
    onChange(value.filter((_, i) => i !== idx));
  };
  const addRow = (): void => {
    onChange([...value, { key: '', value: '' }]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted font-medium">
          Environment variables
        </label>
        <button
          type="button"
          onClick={addRow}
          disabled={disabled}
          className="
            inline-flex items-center gap-1 text-xs text-accent
            hover:text-accent-soft disabled:opacity-40
          "
        >
          <Plus size={12} />
          Add variable
        </button>
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-muted">No env vars. Click "Add variable" to add one.</p>
      ) : (
        <div className="space-y-1.5">
          {value.map((v, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="KEY"
                spellCheck={false}
                autoComplete="off"
                value={v.key}
                onChange={(e) => updateAt(idx, { key: e.target.value })}
                disabled={disabled}
                className="
                  flex-1 min-w-0 h-8 px-2 rounded-input bg-paper border border-line
                  text-xs mono uppercase tracking-wide text-ink
                  placeholder:text-muted
                  focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20
                "
              />
              <span className="text-muted text-xs">=</span>
              <input
                type="text"
                placeholder="value"
                spellCheck={false}
                autoComplete="off"
                value={v.value}
                onChange={(e) => updateAt(idx, { value: e.target.value })}
                disabled={disabled}
                className="
                  flex-[2] min-w-0 h-8 px-2 rounded-input bg-paper border border-line
                  text-xs mono text-ink
                  placeholder:text-muted
                  focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20
                "
              />
              <button
                type="button"
                onClick={() => removeAt(idx)}
                disabled={disabled}
                aria-label="Remove variable"
                className="
                  h-8 w-8 grid place-items-center rounded-md text-muted
                  hover:text-state-error hover:bg-state-error/10
                  disabled:opacity-40
                  transition-colors duration-[var(--dur-micro)]
                "
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
