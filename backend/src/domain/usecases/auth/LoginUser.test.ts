import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedError } from '../../../lib/errors.js';
import { fakeLogger } from '../../../testing/fakes.js';
import type { AuthService } from '../../ports/AuthService.js';
import type { TokenService } from '../../ports/TokenService.js';
import { GetCurrentUser } from './GetCurrentUser.js';
import { LoginUser } from './LoginUser.js';

const admin = { username: 'admin', role: 'admin' } as const;

function build(user: typeof admin | null) {
  const authService: AuthService = { authenticate: vi.fn(async () => user) };
  const tokens: TokenService = { sign: vi.fn(() => 'signed.jwt'), verify: vi.fn() };
  const logger = fakeLogger();
  return { useCase: new LoginUser({ authService, tokens, logger }), authService, tokens, logger };
}

describe('LoginUser', () => {
  it('signs a token for valid credentials', async () => {
    const { useCase, tokens } = build(admin);
    await expect(useCase.execute('admin', 'pw', 3600)).resolves.toEqual({
      user: admin,
      token: 'signed.jwt',
      ttlSeconds: 3600,
    });
    expect(tokens.sign).toHaveBeenCalledWith(admin, 3600);
  });

  it('throws UnauthorizedError and signs nothing for invalid credentials', async () => {
    const { useCase, tokens, logger } = build(null);
    await expect(useCase.execute('admin', 'bad', 3600)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(tokens.sign).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('login failed', { username: 'admin' });
  });

  it('never logs the password', async () => {
    const { useCase, logger } = build(null);
    await useCase.execute('admin', 'hunter2-secret', 60).catch(() => undefined);
    const logged = JSON.stringify([
      (logger.warn as ReturnType<typeof vi.fn>).mock.calls,
      (logger.info as ReturnType<typeof vi.fn>).mock.calls,
    ]);
    expect(logged).not.toContain('hunter2-secret');
  });
});

describe('GetCurrentUser', () => {
  it('returns the authenticated user as-is', () => {
    expect(new GetCurrentUser().execute(admin)).toEqual(admin);
  });
});
