/* Hallmark · genre: modern-minimal · login: single-card centre, asymmetric */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './store';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const login = useAuth((s) => s.login);
  const error = useAuth((s) => s.error);
  const navigate = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(username, password);
      navigate('/', { replace: true });
    } catch {
      /* error is in store */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-full grid grid-cols-1 lg:grid-cols-2 bg-bg">
      {/* left half — wordmark + ambient context */}
      <aside className="hidden lg:flex flex-col justify-between p-10 xl:p-14 border-r border-line">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center h-7 w-7 rounded-md bg-ink text-accent-ink">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M21 9.5c-.3-1.6-1.7-2.5-3.3-2.3-.3 0-.5.2-.5.5v1.8c0 .3.2.5.5.5 1 0 1.7.6 1.9 1.5H2.5c-.3 0-.5.2-.5.5 0 3.5 1.4 6.4 3.7 8.4 2 1.7 4.6 2.6 7.6 2.6 5.5 0 9.4-3 10.4-7.7.4.1 1.4.1 2-.4 0 0-1.4-.5-1.7-1.4 0 0-.4-.7-1.3-1.4l-.7-.6c0-.6-.3-1.5-1-2zM7 13h2v4H7v-4zm3 0h2v4h-2v-4zm3 0h2v4h-2v-4z" />
            </svg>
          </span>
          <span className="font-semibold tracking-tight">portwatch</span>
          <span className="text-muted text-xs mono">/v1</span>
        </div>

        <div className="max-w-md">
          <p className="text-2xl text-heading leading-snug tracking-tight">
            Watch the containers on this host.
          </p>
          <p className="mt-3 text-sm text-muted leading-relaxed">
            Live CPU, memory, disk and network stats. Real-time per-container
            metrics. A terminal for stdout and stderr.
          </p>
        </div>

        <p className="mono text-xs text-muted">self-hosted · single-admin</p>
      </aside>

      {/* right half — sign-in card, vertically centred */}
      <section className="flex items-center justify-center p-6 lg:p-10 bg-bg">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-[360px] bg-panel border border-line rounded-card p-7 space-y-5 reveal"
          style={{ ['--i' as string]: 0 }}
        >
          <header className="space-y-1">
            <h1 className="text-xl text-heading tracking-tight font-semibold">
              Sign in
            </h1>
            <p className="text-sm text-muted">
              Use the admin credentials set in <span className="mono">.env</span>.
            </p>
          </header>

          <div className="space-y-3">
            <Field
              label="Username"
              value={username}
              onChange={setUsername}
              placeholder="admin"
              autoFocus
            />
            <Field
              label="Password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              type="password"
            />
          </div>

          {error && (
            <div className="text-xs text-state-error bg-state-error/5 border border-state-error/20 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={submitting}
            className="w-full"
          >
            {submitting ? <Spinner size={14} /> : null}
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </section>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
  autoFocus?: boolean;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoFocus,
}: FieldProps) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted mb-1.5">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        required
        className="
          w-full h-10 mono text-sm
          bg-paper border border-line rounded-input
          px-3 placeholder:text-muted/60
          transition-colors duration-[var(--dur-micro)]
          focus:outline-none focus:border-accent
        "
      />
    </label>
  );
}