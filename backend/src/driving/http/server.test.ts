import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppWiring } from '../../composition/container.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { buildHttpServer } from './server.js';

function fakeWiring(overrides: Record<string, unknown> = {}): AppWiring {
  return {
    config: {
      LOG_LEVEL: 'fatal',
      TRUST_PROXY_HOPS: 1,
      CORS_ORIGINS: ['http://localhost:5173'],
      LOGIN_RATE_LIMIT_MAX: 3,
      LOGIN_RATE_LIMIT_WINDOW_MS: 60_000,
      JWT_TTL_SECONDS: 60,
      COOKIE_SECURE: false,
      COOKIE_SAMESITE: 'strict',
      ...overrides,
    },
    useCases: {
      login: {
        execute: vi.fn(async (_user: string, password: string) => {
          if (password !== 'right') throw new UnauthorizedError('Invalid credentials');
          return { token: 't', user: { username: 'admin', role: 'admin' } };
        }),
      },
    },
    ports: { tokens: { verify: vi.fn() } },
  } as unknown as AppWiring;
}

let server: Server | undefined;

async function start(wiring: AppWiring): Promise<string> {
  const app = buildHttpServer(wiring);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

function login(base: string, password: string, ip = '203.0.113.9'): Promise<Response> {
  return fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ username: 'admin', password }),
  });
}

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

describe('login rate limiting', () => {
  it('returns 429 after too many failed attempts from one IP', async () => {
    const base = await start(fakeWiring());
    for (let i = 0; i < 3; i++) expect((await login(base, 'bad')).status).toBe(401);
    const blocked = await login(base, 'bad');
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ error: 'too_many_requests' });
  });

  it('keys on the client IP forwarded by the proxy, not the proxy itself', async () => {
    const base = await start(fakeWiring());
    for (let i = 0; i < 3; i++) await login(base, 'bad', '203.0.113.9');
    expect((await login(base, 'bad', '203.0.113.9')).status).toBe(429);
    expect((await login(base, 'bad', '198.51.100.7')).status).toBe(401);
  });

  it('does not count successful logins against the budget', async () => {
    const base = await start(fakeWiring());
    for (let i = 0; i < 6; i++) expect((await login(base, 'right')).status).toBe(200);
  });
});

describe('CORS and headers', () => {
  it('reflects only allow-listed origins', async () => {
    const base = await start(fakeWiring());
    const ok = await fetch(`${base}/health`, { headers: { origin: 'http://localhost:5173' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(ok.headers.get('access-control-allow-credentials')).toBe('true');

    const evil = await fetch(`${base}/health`, { headers: { origin: 'https://evil.example' } });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('sends no CORS headers at all when no origins are configured', async () => {
    const base = await start(fakeWiring({ CORS_ORIGINS: [] }));
    const res = await fetch(`${base}/health`, { headers: { origin: 'http://localhost:5173' } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('locks down CSP and framing on API responses', async () => {
    const base = await start(fakeWiring());
    const res = await fetch(`${base}/health`);
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});
