import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
import { useAuth } from './store';

const login = vi.fn();

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>dashboard home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  login.mockReset();
  useAuth.setState({ user: null, status: 'idle', error: null, login });
});

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, name = 'admin', pw = 'hunter2') {
  await user.type(screen.getByLabelText('Username'), name);
  await user.type(screen.getByLabelText('Password'), pw);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginPage', () => {
  it('asks for a username and a masked password, both required', () => {
    renderPage();
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toBeRequired();
    expect(screen.getByLabelText('Username')).toBeRequired();
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('focuses the username field so the admin can start typing', () => {
    renderPage();
    expect(screen.getByLabelText('Username')).toHaveFocus();
  });

  it('signs in with the typed credentials and lands on the dashboard', async () => {
    login.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await fillAndSubmit(user);

    expect(login).toHaveBeenCalledWith('admin', 'hunter2');
    expect(await screen.findByText('dashboard home')).toBeInTheDocument();
  });

  it('submits with the Enter key', async () => {
    login.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Username'), 'admin');
    await user.type(screen.getByLabelText('Password'), 'pw{Enter}');
    expect(login).toHaveBeenCalledWith('admin', 'pw');
  });

  it('shows a progress state and blocks double submits while the request is in flight', async () => {
    let finish!: () => void;
    login.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    renderPage();

    await fillAndSubmit(user);

    const busy = await screen.findByRole('button', { name: /Signing in…/ });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(login).toHaveBeenCalledTimes(1);

    finish();
    expect(await screen.findByText('dashboard home')).toBeInTheDocument();
  });

  it('stays on the page, shows the server error and lets the user retry after a failure', async () => {
    login.mockImplementation(async () => {
      useAuth.setState({ status: 'error', error: 'Invalid credentials' });
      throw new Error('Invalid credentials');
    });
    const user = userEvent.setup();
    renderPage();

    await fillAndSubmit(user, 'admin', 'wrong');

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    expect(screen.queryByText('dashboard home')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled());
    // the typed username is kept so a typo in the password is quick to fix
    expect(screen.getByLabelText('Username')).toHaveValue('admin');
  });

  it('does not show an error banner before anything went wrong', () => {
    renderPage();
    expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument();
  });
});
