import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authApi = vi.hoisted(() => ({ login: vi.fn(), logout: vi.fn(), me: vi.fn() }));
vi.mock('@/features/auth/api', () => ({ authApi }));

// The pages pull in charts, a terminal emulator and sockets; routing is what is under test.
vi.mock('@/features/containers/DashboardPage', () => ({ DashboardPage: () => <div>dashboard page</div> }));
vi.mock('@/features/containers/ContainerViewPage', () => ({ ContainerViewPage: () => <div>container page</div> }));
vi.mock('@/features/projects/ProjectsPage', () => ({ ProjectsPage: () => <div>projects page</div> }));
vi.mock('./Layout', () => ({ Layout: ({ children }: { children: ReactNode }) => <main data-testid="layout">{children}</main> }));

import { useAuth } from '@/features/auth/store';
import { App } from './App';

const admin = { username: 'admin', role: 'admin' as const };

function visit(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

beforeEach(() => {
  Object.values(authApi).forEach((f) => f.mockReset());
  useAuth.setState({
    user: null,
    status: 'idle',
    error: null,
    // re-install the real actions: other test files replace them
    bootstrap: useAuth.getInitialState().bootstrap,
    login: useAuth.getInitialState().login,
    logout: useAuth.getInitialState().logout,
  });
});

describe('route protection', () => {
  it.each([
    ['/', 'dashboard page'],
    ['/containers/abc123', 'container page'],
    ['/projects', 'projects page'],
  ])('shows %s inside the layout to a signed-in admin', async (path, text) => {
    authApi.me.mockResolvedValue({ user: admin });
    visit(path);

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByTestId('layout')).toContainElement(screen.getByText(text));
  });

  it.each(['/', '/containers/abc123', '/projects'])(
    'sends a visitor without a session from %s to the login page',
    async (path) => {
      authApi.me.mockRejectedValue(new Error('Missing auth cookie'));
      visit(path);

      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
      expect(window.location.pathname).toBe('/login');
      expect(screen.queryByText('dashboard page')).not.toBeInTheDocument();
      expect(screen.queryByTestId('layout')).not.toBeInTheDocument();
    },
  );

  it('shows a spinner, and no protected content, while the session is being checked', async () => {
    let resolveMe!: (v: unknown) => void;
    authApi.me.mockReturnValue(new Promise((r) => (resolveMe = r)));
    visit('/');

    expect(await screen.findByLabelText('loading')).toBeInTheDocument();
    expect(screen.queryByText('dashboard page')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();

    resolveMe({ user: admin });
    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
  });

  it('checks the session once, not on every protected route change', async () => {
    authApi.me.mockResolvedValue({ user: admin });
    visit('/');
    await screen.findByText('dashboard page');
    expect(authApi.me).toHaveBeenCalledTimes(1);
  });

  it('does not require a session to see the login page', async () => {
    visit('/login');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(authApi.me).not.toHaveBeenCalled();
  });
});

describe('unknown routes', () => {
  it('redirect to the dashboard', async () => {
    authApi.me.mockResolvedValue({ user: admin });
    visit('/definitely/not/a/page');
    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  it('and still demand a login first', async () => {
    authApi.me.mockRejectedValue(new Error('nope'));
    visit('/nowhere');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('signing in end to end', () => {
  it('logging in from /login leads to the dashboard', async () => {
    authApi.me.mockRejectedValue(new Error('no session'));
    authApi.login.mockResolvedValue({ user: admin });
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    visit('/projects');

    await screen.findByRole('heading', { name: 'Sign in' });
    await user.type(screen.getByLabelText('Username'), 'admin');
    await user.type(screen.getByLabelText('Password'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(authApi.login).toHaveBeenCalledWith('admin', 'pw');
    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
  });
});
