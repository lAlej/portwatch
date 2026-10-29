import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { api, ApiError } from './api';

const fetchMock = vi.fn();

function respond(status: number, body?: unknown, opts: { raw?: string; statusText?: string } = {}) {
  const text = opts.raw ?? (body === undefined ? '' : JSON.stringify(body));
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: opts.statusText ?? '',
    text: async () => text,
  });
}

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit & Record<string, unknown>];
  return { url, init };
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('requests', () => {
  it('sends cookies and JSON headers on every call', async () => {
    respond(200, { ok: true });
    await api.get('/api/containers');
    const { url, init } = lastCall();
    expect(url).toBe('/api/containers');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
    expect(init.body).toBeUndefined();
  });

  it('serialises the body for POST and PUT', async () => {
    respond(200, {});
    await api.post('/x', { a: 1 });
    expect(lastCall().init).toMatchObject({ method: 'POST', body: '{"a":1}' });

    respond(200, {});
    await api.put('/x', { b: [2] });
    expect(lastCall().init).toMatchObject({ method: 'PUT', body: '{"b":[2]}' });
  });

  it('sends no body when none is given', async () => {
    respond(200, {});
    await api.post('/api/auth/logout');
    expect(lastCall().init.body).toBeUndefined();
  });

  it('uses DELETE for del', async () => {
    respond(200, { ok: true });
    await api.del('/api/projects/p1');
    expect(lastCall().init.method).toBe('DELETE');
  });

  it('prefixes paths with VITE_API_BASE when the API lives on another origin', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://api.example.com');
    vi.resetModules();
    const { api: remote } = await import('./api');
    respond(200, {});
    await remote.get('/api/auth/me');
    expect(lastCall().url).toBe('https://api.example.com/api/auth/me');
    vi.unstubAllEnvs();
  });
});

describe('responses', () => {
  it('returns the parsed JSON body', async () => {
    respond(200, { containers: [] });
    await expect(api.get('/api/containers')).resolves.toEqual({ containers: [] });
  });

  it('returns null for an empty body (204)', async () => {
    respond(204);
    await expect(api.del('/x')).resolves.toBeNull();
  });

  it('validates the body against the schema and returns the parsed value', async () => {
    const Schema = z.object({ n: z.number() });
    respond(200, { n: 5, extra: 'dropped' });
    await expect(api.get('/x', Schema)).resolves.toEqual({ n: 5 });
  });

  it('rejects a response that does not match the schema', async () => {
    const Schema = z.object({ n: z.number() });
    respond(200, { n: 'five' });
    const err = await api.get('/x', Schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 500, code: 'schema_error', message: 'Invalid response from server' });
    expect((err as ApiError).issues).toBeInstanceOf(Array);
  });
});

describe('errors', () => {
  it('turns the backend error payload into an ApiError', async () => {
    respond(409, { error: 'invalid_state', message: 'Project "web" already exists' });
    const err = await api.post('/x', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      name: 'ApiError',
      status: 409,
      code: 'invalid_state',
      message: 'Project "web" already exists',
    });
  });

  it('keeps validation issues so forms can show them', async () => {
    const issues = [{ path: 'key', message: 'must match [A-Za-z_][A-Za-z0-9_]*' }];
    respond(400, { error: 'validation_error', issues });
    const err = (await api.put('/x', {}).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('validation_error');
    expect(err.issues).toEqual(issues);
  });

  it('describes validation issues when the server sent no message', async () => {
    respond(400, {
      error: 'validation_error',
      issues: [
        { path: 'envVars.0.key', message: 'must match [A-Za-z_][A-Za-z0-9_]*' },
        { path: '', message: 'Invalid input' },
      ],
    });
    const err = (await api.put('/x', {}).catch((e: unknown) => e)) as ApiError;
    expect(err.message).toBe('envVars.0.key: must match [A-Za-z_][A-Za-z0-9_]*; Invalid input');
  });

  it('prefers the server message over generated issue text', async () => {
    respond(400, { error: 'validation_error', message: 'Custom', issues: [{ path: 'a', message: 'b' }] });
    const err = (await api.put('/x', {}).catch((e: unknown) => e)) as ApiError;
    expect(err.message).toBe('Custom');
  });

  it('ignores malformed issues and falls back to the status text', async () => {
    respond(400, { error: 'validation_error', issues: [null, 'x', { path: 'a' }] }, { statusText: 'Bad Request' });
    const err = (await api.put('/x', {}).catch((e: unknown) => e)) as ApiError;
    expect(err.message).toBe('Bad Request');
  });

  it('falls back to the HTTP status text when the body has no message', async () => {
    respond(500, {}, { statusText: 'Internal Server Error' });
    const err = (await api.get('/x').catch((e: unknown) => e)) as ApiError;
    expect(err).toMatchObject({ status: 500, code: 'error', message: 'Internal Server Error' });
  });

  it('copes with an empty error body', async () => {
    respond(503, undefined, { statusText: 'Service Unavailable' });
    const err = (await api.get('/x').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(503);
  });

  it('reports a proxy HTML error page (e.g. Caddy 502) as an ApiError, not a JSON syntax error', async () => {
    respond(502, undefined, { raw: '<html><body>Bad Gateway</body></html>', statusText: 'Bad Gateway' });
    const err = await api.get('/api/containers').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 502, message: 'Bad Gateway' });
  });

  it('reports a non-JSON success body as an invalid response', async () => {
    respond(200, undefined, { raw: 'OK' });
    const err = await api.get('/x', z.object({})).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'invalid_response' });
  });

  it('lets network failures through untouched', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.get('/x')).rejects.toThrow('Failed to fetch');
  });
});
