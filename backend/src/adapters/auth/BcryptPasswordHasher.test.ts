import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../lib/env.js';
import { BcryptPasswordHasher } from './BcryptPasswordHasher.js';

describe('BcryptPasswordHasher', () => {
  const hasher = new BcryptPasswordHasher();

  it('produces a salted bcrypt hash that verifies only the original password', async () => {
    const hash = await hasher.hash('s3cret!');
    expect(hash).toMatch(/^\$2[aby]\$12\$/); // cost factor 12
    expect(await hasher.verify('s3cret!', hash)).toBe(true);
    expect(await hasher.verify('S3cret!', hash)).toBe(false);
    expect(await hasher.verify('', hash)).toBe(false);
  });

  it('salts every hash differently', async () => {
    const [a, b] = await Promise.all([hasher.hash('same'), hasher.hash('same')]);
    expect(a).not.toBe(b);
  });

  it('produces hashes that pass the ADMIN_PASSWORD_HASH validation at startup', async () => {
    const hash = await hasher.hash('pw');
    const saved = { ...process.env };
    try {
      Object.assign(process.env, {
        ADMIN_USERNAME: 'admin',
        ADMIN_PASSWORD_HASH: hash,
        JWT_SECRET: 'k'.repeat(48),
      });
      expect(loadConfig().ADMIN_PASSWORD_HASH).toBe(hash);
    } finally {
      process.env = saved;
    }
  });

  it('verifies hashes created by other bcrypt implementations', async () => {
    expect(await hasher.verify('interop', bcrypt.hashSync('interop', 4))).toBe(true);
  });

  it('rejects a malformed hash instead of accepting anything', async () => {
    expect(await hasher.verify('x', 'not-a-bcrypt-hash').catch(() => false)).toBe(false);
  });
});
