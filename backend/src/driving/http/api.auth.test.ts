import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_PASSWORD, ADMIN_USERNAME, startApp, testConfig, type TestApp } from '../../testing/app.js';

let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const secret = testConfig().JWT_SECRET;
const post = (a: TestApp, body: unknown) => a.request('/api/auth/login', { method: 'POST', body });

describe('POST /api/auth/login', () => {
  it('signs the admin in and sets a hardened session cookie', async () => {
    app = await startApp();
    const res = await post(app, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.json).toEqual({ user: { username: ADMIN_USERNAME, role: 'admin' } });

    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^token=[\w-]+\.[\w-]+\.[\w-]+;/); // a JWT
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=3600');
    expect(cookie).not.toContain('Secure');
    // The token must not be handed back in the body where scripts could read it.
    expect(JSON.stringify(res.json)).not.toContain('eyJ');
  });

  it('marks the cookie Secure when COOKIE_SECURE is on', async () => {
    app = await startApp({ COOKIE_SECURE: true });
    const res = await post(app, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
    expect(res.headers.get('set-cookie')).toContain('Secure');
  });

  it('respects COOKIE_SAMESITE', async () => {
    app = await startApp({ COOKIE_SAMESITE: 'lax' });
    const res = await post(app, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
    expect(res.headers.get('set-cookie')).toContain('SameSite=Lax');
  });

  it('answers wrong password and unknown user identically (no user enumeration)', async () => {
    app = await startApp();
    const wrongPassword = await post(app, { username: ADMIN_USERNAME, password: 'nope' });
    const unknownUser = await post(app, { username: 'ghost', password: ADMIN_PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(unknownUser.json).toEqual(wrongPassword.json);
    expect(wrongPassword.json).toEqual({ error: 'unauthorized', message: 'Invalid credentials' });
    expect(wrongPassword.headers.get('set-cookie')).toBeNull();
  });

  it.each([
    ['missing password', { username: 'admin' }],
    ['empty username', { username: '', password: 'x' }],
    ['non-string password', { username: 'admin', password: 12345 }],
    ['oversized password', { username: 'admin', password: 'p'.repeat(1025) }],
    ['empty body', {}],
  ])('rejects %s with a 400 validation error', async (_name, body) => {
    app = await startApp();
    const res = await post(app, body);
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ error: 'validation_error' });
    expect(res.json.issues.length).toBeGreaterThan(0);
  });

  it('rate limits repeated failures per IP and recovers the budget on success', async () => {
    app = await startApp({ LOGIN_RATE_LIMIT_MAX: 2 });
    expect((await post(app, { username: 'admin', password: 'bad' })).status).toBe(401);
    expect((await post(app, { username: 'admin', password: 'bad' })).status).toBe(401);
    const blocked = await post(app, { username: 'admin', password: ADMIN_PASSWORD });
    expect(blocked.status).toBe(429); // even the right password is refused while blocked
    expect(blocked.json.error).toBe('too_many_requests');
    expect(blocked.headers.get('retry-after')).not.toBeNull();
  });
});

describe('session cookie', () => {
  it('GET /me returns the user for a valid session', async () => {
    app = await startApp();
    const cookie = await app.login();
    const res = await app.request('/api/auth/me', { cookie });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ user: { username: ADMIN_USERNAME, role: 'admin' } });
  });

  it('rejects requests without a cookie', async () => {
    app = await startApp();
    const res = await app.request('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.json).toMatchObject({ error: 'unauthorized' });
  });

  it.each([
    ['garbage', 'token=not-a-jwt'],
    ['empty', 'token='],
    ['signed with another secret', `token=${jwt.sign({ sub: 'admin', role: 'admin' }, 'y'.repeat(48))}`],
    ['expired', `token=${jwt.sign({ sub: 'admin', role: 'admin' }, secret, { expiresIn: -5 })}`],
    ['alg none', `token=${jwt.sign({ sub: 'admin', role: 'admin' }, '', { algorithm: 'none' })}`],
    ['wrong role', `token=${jwt.sign({ sub: 'admin', role: 'root' }, secret)}`],
  ])('rejects a %s token', async (_name, cookie) => {
    app = await startApp();
    const res = await app.request('/api/auth/me', { cookie });
    expect(res.status).toBe(401);
  });

  it('does not accept the token from anywhere but the cookie', async () => {
    app = await startApp();
    const cookie = await app.login();
    const token = cookie.replace('token=', '');
    const viaHeader = await app.request('/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
    expect(viaHeader.status).toBe(401);
  });

  it('POST /logout clears the cookie and needs no session', async () => {
    app = await startApp();
    const res = await app.request('/api/auth/logout', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^token=;/);
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe('route protection', () => {
  const protectedRoutes: Array<[string, string]> = [
    ['GET', '/api/containers'],
    ['POST', '/api/containers/abc/start'],
    ['POST', '/api/containers/abc/pause'],
    ['POST', '/api/containers/abc/unpause'],
    ['POST', '/api/containers/abc/restart'],
    ['POST', '/api/containers/abc/kill'],
    ['GET', '/api/containers/abc/inspect'],
    ['GET', '/api/containers/abc/project'],
    ['GET', '/api/system/snapshot'],
    ['GET', '/api/projects'],
    ['POST', '/api/projects'],
    ['POST', '/api/projects/ad-hoc'],
    ['PUT', '/api/projects/abc/env'],
    ['DELETE', '/api/projects/abc'],
    ['GET', '/api/projects/abc/deployments'],
    ['POST', '/api/projects/abc/deploy'],
    ['GET', '/api/projects/abc/compose'],
    ['PUT', '/api/projects/abc/compose'],
    ['GET', '/api/auth/me'],
  ];

  it.each(protectedRoutes)('%s %s requires a session', async (method, path) => {
    app = await startApp();
    const res = await app.request(path, { method, body: method === 'GET' ? undefined : {} });
    expect(res.status).toBe(401);
    expect(res.json).toMatchObject({ error: 'unauthorized' });
  });
});
