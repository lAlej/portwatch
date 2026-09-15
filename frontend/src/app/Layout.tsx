/* Hallmark · genre: modern-minimal · nav: N5 floating pill · footer: Ft2 inline */

import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/features/auth/store';
import { useConnection } from '@/shared/lib/connection';
import { getSocket } from '@/shared/lib/ws';
import { useContainers } from '@/features/containers/store';

interface Props {
  children: ReactNode;
}

export function Layout({ children }: Props) {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const connected = useConnection((s) => s.connected);
  const containers = useContainers((s) => s.items);
  const running = containers.filter((c) => c.state === 'running').length;
  const loc = useLocation();

  useEffect(() => {
    getSocket();
  }, []);

  const onLogout = async () => {
    await logout();
    window.location.assign('/login');
  };

  return (
    <div className="min-h-full flex flex-col bg-bg">
      {/* N5 floating pill nav — detached from edges, sits ~24px from top */}
      <header className="sticky top-6 z-[var(--z-sticky)] px-6">
        <nav
          className="
            mx-auto max-w-6xl
            flex items-center gap-4 h-12 px-3
            bg-paper/85 backdrop-blur
            border border-line rounded-pill
            shadow-[0_1px_2px_oklch(20%_0.01_60/0.04)]
          "
        >
          <Link
            to="/"
            className="flex items-center gap-2 pl-2 pr-3 text-heading hover:text-ink transition-colors duration-[var(--dur-micro)]"
          >
            <DockerMark />
            <span className="font-semibold tracking-tight text-[15px]">docker</span>
            <span className="text-muted text-xs mono">/dashboard</span>
          </Link>

          <div className="h-5 w-px bg-line" aria-hidden />

          <div className="flex items-center gap-1 text-sm">
            <NavTab to="/" label="Containers" active={loc.pathname === '/'} />
            <NavTab to="/projects" label="Projects" active={loc.pathname.startsWith('/projects')} />
          </div>

          <div className="ml-auto flex items-center gap-3 pr-2 text-sm">
            <ConnectionPill
              connected={connected}
              running={running}
              total={containers.length}
            />
            <div className="flex items-center gap-2">
              <span className="text-muted mono text-xs hidden sm:inline">
                {user?.username}
              </span>
              <button
                onClick={onLogout}
                className="h-8 w-8 grid place-items-center rounded-md text-muted hover:text-ink hover:bg-raised transition-colors duration-[var(--dur-micro)]"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </nav>
      </header>

      <main className="flex-1 px-6 pt-8 pb-12">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      <Footer />
    </div>
  );
}

function NavTab({
  to,
  label,
  active,
}: {
  to: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={
        active
          ? 'inline-flex items-center gap-1.5 px-3 h-8 rounded-pill bg-raised text-ink font-medium'
          : 'inline-flex items-center gap-1.5 px-3 h-8 rounded-pill text-muted hover:text-ink hover:bg-raised transition-colors duration-[var(--dur-micro)]'
      }
    >
      {active && (
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
      )}
      {label}
    </Link>
  );
}

function ConnectionPill({
  connected,
  running,
  total,
}: {
  connected: boolean;
  running: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-2 mono text-xs text-muted">
      <span
        className={
          connected
            ? 'inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse-live'
            : 'inline-block h-1.5 w-1.5 rounded-full bg-state-error'
        }
      />
      <span className="text-ink">{connected ? 'live' : 'offline'}</span>
      <span className="text-line">·</span>
      <span>
        <span className="text-ink tabular">{running}</span>
        <span>/{total}</span> running
      </span>
    </div>
  );
}

/* compact docker-mobyl-style mark — geometric, monochrome ink */
function DockerMark() {
  return (
    <span
      aria-hidden
      className="grid place-items-center h-6 w-6 rounded-md bg-ink text-accent-ink"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M21 9.5c-.3-1.6-1.7-2.5-3.3-2.3-.3 0.0-.5.2-.5.5v1.8c0 .3.2.5.5.5 1 0 1.7.6 1.9 1.5H2.5c-.3 0-.5.2-.5.5 0 3.5 1.4 6.4 3.7 8.4 2 1.7 4.6 2.6 7.6 2.6 5.5 0 9.4-3 10.4-7.7.4.1 1.4.1 2-.4 0 0-1.4-.5-1.7-1.4 0 0-.4-.7-1.3-1.4l-.7-.6c0-.6-.3-1.5-1-2zM7 13h2v4H7v-4zm3 0h2v4h-2v-4zm3 0h2v4h-2v-4z" />
      </svg>
    </span>
  );
}

/* Ft2 inline single-line footer */
function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between text-xs text-muted">
        <span className="mono">docker /dashboard</span>
        <span>manage containers on this host</span>
      </div>
    </footer>
  );
}