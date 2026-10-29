import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidStateError, NotFoundError } from '../../lib/errors.js';
import { startApp, type TestApp } from '../../testing/app.js';

let app: TestApp;
let cookie: string;
beforeEach(async () => {
  app = await startApp();
  cookie = await app.login();
});
afterEach(() => app.close());

const api = (path: string, method = 'GET') => app.request(path, { method, cookie });

describe('container actions', () => {
  it.each(['start', 'pause', 'unpause', 'restart', 'kill'] as const)(
    'POST /:id/%s runs the matching use case with the id',
    async (action) => {
      const execute = vi.fn(async () => undefined);
      app.wiring.useCases[action] = { execute } as never;

      const res = await api(`/api/containers/abc123/${action}`, 'POST');

      expect(res.status).toBe(200);
      expect(res.json).toEqual({ ok: true, id: 'abc123' });
      expect(execute).toHaveBeenCalledWith('abc123');
    },
  );

  it('does not run an action that was not requested', async () => {
    const kill = vi.fn(async () => undefined);
    app.wiring.useCases.kill = { execute: kill } as never;
    app.wiring.useCases.pause = { execute: vi.fn(async () => undefined) } as never;
    await api('/api/containers/abc/pause', 'POST');
    expect(kill).not.toHaveBeenCalled();
  });

  it('maps a missing container to 404', async () => {
    app.wiring.useCases.kill = {
      execute: vi.fn(async () => Promise.reject(new NotFoundError('Container abc not found'))),
    } as never;
    const res = await api('/api/containers/abc/kill', 'POST');
    expect(res.status).toBe(404);
    expect(res.json).toEqual({ error: 'not_found', message: 'Container abc not found' });
  });

  it('maps an invalid state transition to 409', async () => {
    app.wiring.useCases.pause = {
      execute: vi.fn(async () => Promise.reject(new InvalidStateError('Cannot pause container abc'))),
    } as never;
    const res = await api('/api/containers/abc/pause', 'POST');
    expect(res.status).toBe(409);
    expect(res.json.error).toBe('invalid_state');
  });

  it('only accepts POST for actions', async () => {
    app.wiring.useCases.kill = { execute: vi.fn() } as never;
    const res = await api('/api/containers/abc/kill', 'GET');
    expect(res.status).toBe(404);
    expect(app.wiring.useCases.kill.execute).not.toHaveBeenCalled();
  });
});

describe('container queries', () => {
  it('lists containers', async () => {
    app.wiring.useCases.listContainers = { execute: vi.fn(async () => [{ id: 'a', name: 'web' }]) } as never;
    const res = await api('/api/containers');
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ containers: [{ id: 'a', name: 'web' }] });
  });

  it('answers 503 docker_unavailable when the Docker socket cannot be reached', async () => {
    const res = await api('/api/containers'); // real repository, bogus socket path
    expect(res.status).toBe(503);
    expect(res.json.error).toBe('docker_unavailable');
  });

  it('returns inspect data', async () => {
    app.wiring.useCases.inspect = { execute: vi.fn(async () => ({ Id: 'abc' })) } as never;
    const res = await api('/api/containers/abc/inspect');
    expect(res.json).toEqual({ inspect: { Id: 'abc' } });
  });

  it('resolves the owning project of a container', async () => {
    app.wiring.useCases.getProjectForContainer = {
      execute: vi.fn(async () => ({ projectId: 'p1' })),
    } as never;
    const res = await api('/api/containers/abc/project');
    expect(res.json).toEqual({ projectId: 'p1' });
  });

  it('returns the system snapshot', async () => {
    app.wiring.useCases.systemSnapshot = { execute: vi.fn(async () => ({ cpu: 1 })) } as never;
    const res = await api('/api/system/snapshot');
    expect(res.json).toEqual({ snapshot: { cpu: 1 } });
  });
});

describe('error handling', () => {
  it('hides the internals of unexpected errors from clients', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    app.wiring.useCases.listContainers = {
      execute: vi.fn(async () => Promise.reject(new Error('ENOENT /var/lib/secret/path'))),
    } as never;

    const res = await api('/api/containers');

    expect(res.status).toBe(500);
    expect(res.json).toEqual({ error: 'internal_error', message: 'Internal server error' });
    expect(JSON.stringify(res.json)).not.toContain('secret');
    expect(log).toHaveBeenCalled(); // still logged server-side
    log.mockRestore();
  });

  it('answers 400, not 500, for a malformed JSON body', async () => {
    const empty = await app.request('/api/projects/ad-hoc', {
      method: 'POST',
      cookie,
      headers: { 'content-type': 'application/json' },
    });
    // No body at all: handled by validation.
    expect(empty.status).toBe(400);

    const raw = await fetch(`${app.baseUrl}/api/projects/ad-hoc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: '{"name": ',
    });
    expect(raw.status).toBe(400);
    expect(await raw.json()).toEqual({ error: 'bad_request', message: 'Malformed request body' });
  });

  it('answers 413 for a body over the global JSON limit, even before authentication', async () => {
    const raw = await fetch(`${app.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'a', password: 'x'.repeat(300_000) }),
    });
    expect(raw.status).toBe(413);
  });
});
