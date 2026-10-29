import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from './env.js';

// A real-shaped bcrypt hash (60 chars). Content is irrelevant to validation.
const HASH = '$2a$12$' + 'a'.repeat(53);
const SECRET = 'k'.repeat(48);

function setEnv(overrides: Record<string, string> = {}): void {
  vi.stubEnv('ADMIN_USERNAME', 'admin');
  vi.stubEnv('ADMIN_PASSWORD_HASH', HASH);
  vi.stubEnv('JWT_SECRET', SECRET);
  for (const [k, v] of Object.entries(overrides)) vi.stubEnv(k, v);
}

describe('loadConfig', () => {
  beforeEach(() => setEnv());
  afterEach(() => vi.unstubAllEnvs());

  it('loads a valid config with safe defaults', () => {
    const cfg = loadConfig();
    expect(cfg.CORS_ORIGINS).toEqual([]);
    expect(cfg.TRUST_PROXY_HOPS).toBe(1);
    expect(cfg.COOKIE_SAMESITE).toBe('strict');
  });

  it('refuses the placeholder JWT secrets shipped in .env.example', () => {
    setEnv({ JWT_SECRET: 'replace-with-a-long-random-secret-at-least-32-bytes' });
    expect(() => loadConfig()).toThrow(/placeholder/);
    setEnv({ JWT_SECRET: 'change-me-to-a-long-random-secret-at-least-32-bytes' });
    expect(() => loadConfig()).toThrow(/placeholder/);
  });

  it('refuses a password value that is not a bcrypt hash', () => {
    setEnv({ ADMIN_PASSWORD_HASH: 'hunter2' });
    expect(() => loadConfig()).toThrow(/bcrypt/);
  });

  it('parses CORS_ORIGINS as a trimmed list', () => {
    setEnv({ CORS_ORIGINS: ' https://a.example , https://b.example ,' });
    expect(loadConfig().CORS_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
  });
});
