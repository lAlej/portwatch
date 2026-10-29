import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../lib/env.js';
import type { PasswordHasher } from '../../domain/ports/PasswordHasher.js';
import { EnvAuthService } from './EnvAuthService.js';

const config = { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD_HASH: 'hash' } as AppConfig;

function build(passwordOk: boolean) {
  const verify = vi.fn().mockResolvedValue(passwordOk);
  const hasher = { verify, hash: vi.fn() } as unknown as PasswordHasher;
  return { service: new EnvAuthService(config, hasher), verify };
}

describe('EnvAuthService', () => {
  it('authenticates the admin with the right password', async () => {
    const { service } = build(true);
    await expect(service.authenticate('admin', 'pw')).resolves.toEqual({
      username: 'admin',
      role: 'admin',
    });
  });

  it('rejects a wrong password', async () => {
    const { service } = build(false);
    await expect(service.authenticate('admin', 'nope')).resolves.toBeNull();
  });

  it('rejects an unknown username even if the password check would pass', async () => {
    const { service } = build(true);
    await expect(service.authenticate('root', 'pw')).resolves.toBeNull();
  });

  it('still runs the password hash for an unknown username (no timing oracle)', async () => {
    const { service, verify } = build(false);
    await service.authenticate('root', 'pw');
    expect(verify).toHaveBeenCalledTimes(1);
  });
});
