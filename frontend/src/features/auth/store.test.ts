import { beforeEach, describe, expect, it, vi } from 'vitest';

const authApi = vi.hoisted(() => ({ login: vi.fn(), logout: vi.fn(), me: vi.fn() }));
vi.mock('./api', () => ({ authApi }));

import { useAuth } from './store';

const admin = { username: 'admin', role: 'admin' as const };

beforeEach(() => {
  Object.values(authApi).forEach((f) => f.mockReset());
  useAuth.setState({ user: null, status: 'idle', error: null });
});

describe('bootstrap', () => {
  it('restores an existing session', async () => {
    authApi.me.mockResolvedValue({ user: admin });
    const p = useAuth.getState().bootstrap();
    expect(useAuth.getState().status).toBe('loading');
    await p;
    expect(useAuth.getState()).toMatchObject({ user: admin, status: 'authenticated' });
  });

  it('falls back to unauthenticated when there is no valid session', async () => {
    authApi.me.mockRejectedValue(new Error('Missing auth cookie'));
    await useAuth.getState().bootstrap();
    expect(useAuth.getState()).toMatchObject({ user: null, status: 'unauthenticated' });
  });

  it('clears a stale error from a previous attempt', async () => {
    useAuth.setState({ error: 'old' });
    authApi.me.mockResolvedValue({ user: admin });
    await useAuth.getState().bootstrap();
    expect(useAuth.getState().error).toBeNull();
  });
});

describe('login', () => {
  it('stores the user on success', async () => {
    authApi.login.mockResolvedValue({ user: admin });
    await useAuth.getState().login('admin', 'pw');
    expect(authApi.login).toHaveBeenCalledWith('admin', 'pw');
    expect(useAuth.getState()).toMatchObject({ user: admin, status: 'authenticated', error: null });
  });

  it('exposes the server message and rethrows on failure', async () => {
    authApi.login.mockRejectedValue(new Error('Invalid credentials'));
    await expect(useAuth.getState().login('admin', 'bad')).rejects.toThrow('Invalid credentials');
    expect(useAuth.getState()).toMatchObject({
      user: null,
      status: 'error',
      error: 'Invalid credentials',
    });
  });

  it('uses a generic message for non-Error rejections', async () => {
    authApi.login.mockRejectedValue('weird');
    await expect(useAuth.getState().login('a', 'b')).rejects.toBe('weird');
    expect(useAuth.getState().error).toBe('Login failed');
  });

  it('clears a previous error when retrying', async () => {
    useAuth.setState({ status: 'error', error: 'Invalid credentials' });
    authApi.login.mockResolvedValue({ user: admin });
    await useAuth.getState().login('admin', 'pw');
    expect(useAuth.getState().error).toBeNull();
  });
});

describe('logout', () => {
  it('ends the local session after telling the server', async () => {
    authApi.logout.mockResolvedValue({ ok: true });
    useAuth.setState({ user: admin, status: 'authenticated' });
    await useAuth.getState().logout();
    expect(authApi.logout).toHaveBeenCalled();
    expect(useAuth.getState()).toMatchObject({ user: null, status: 'unauthenticated' });
  });

  it('still signs out locally when the server cannot be reached', async () => {
    authApi.logout.mockRejectedValue(new Error('network down'));
    useAuth.setState({ user: admin, status: 'authenticated' });
    await useAuth.getState().logout();
    expect(useAuth.getState()).toMatchObject({ user: null, status: 'unauthenticated' });
  });
});
