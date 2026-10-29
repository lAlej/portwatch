import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UpdateProjectCompose } from '../../domain/usecases/projects/UpdateProjectCompose.js';
import { RecordingPublisher, fakeCompose, fakeLogger, makeProject } from '../../testing/fakes.js';
import { startApp, type TestApp } from '../../testing/app.js';

const COMPOSE = 'services:\n  web:\n    image: nginx:alpine\n';

let app: TestApp;
let cookie: string;
beforeEach(async () => {
  app = await startApp();
  cookie = await app.login();
  // Real repositories, but never shell out to `docker compose` from a test.
  app.wiring.useCases.updateProjectCompose = new UpdateProjectCompose({
    repo: app.wiring.ports.projects,
    compose: fakeCompose(),
    publisher: new RecordingPublisher(),
    logger: fakeLogger(),
  });
});
afterEach(() => app.close());

const api = (path: string, method = 'GET', body?: unknown) =>
  app.request(path, { method, body, cookie });

async function createAdHoc(name = 'web', envVars: Array<{ key: string; value: string }> = []) {
  const res = await api('/api/projects/ad-hoc', 'POST', { name, composeContent: COMPOSE, envVars });
  expect(res.status).toBe(201);
  return res.json.project as { id: string; name: string; path: string };
}

describe('ad-hoc projects', () => {
  it('creates a project from pasted compose, on disk and in the registry', async () => {
    const project = await createAdHoc('web', [{ key: 'PORT', value: '8080' }]);

    expect(project.name).toBe('web');
    expect(await fs.readFile(join(app.projectsDir, 'web', 'docker-compose.yml'), 'utf8')).toBe(COMPOSE);
    expect(await fs.readFile(join(app.projectsDir, 'web', '.env'), 'utf8')).toBe('PORT=8080\n');

    const list = await api('/api/projects');
    expect(list.status).toBe(200);
    expect(list.json.projects.map((p: { name: string }) => p.name)).toEqual(['web']);
  });

  it('answers 409 for a duplicate name', async () => {
    await createAdHoc('web');
    const res = await api('/api/projects/ad-hoc', 'POST', { name: 'web', composeContent: COMPOSE });
    expect(res.status).toBe(409);
    expect(res.json).toMatchObject({ error: 'invalid_state' });
  });

  it("answers 409 for the dashboard's own project name and writes nothing", async () => {
    const res = await api('/api/projects/ad-hoc', 'POST', { name: 'portwatch', composeContent: COMPOSE });
    expect(res.status).toBe(409);
    await expect(fs.access(join(app.projectsDir, 'portwatch'))).rejects.toThrow();
  });

  it.each([
    ['missing compose', { name: 'x' }],
    ['empty name', { name: '', composeContent: COMPOSE }],
    ['name too long', { name: 'n'.repeat(129), composeContent: COMPOSE }],
  ])('rejects %s with 400', async (_n, body) => {
    const res = await api('/api/projects/ad-hoc', 'POST', body);
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('validation_error');
  });

  it('answers 413 (not 500) when the body exceeds the global 256KB limit', async () => {
    const res = await api('/api/projects/ad-hoc', 'POST', { name: 'x', composeContent: 'a'.repeat(300_000) });
    expect(res.status).toBe(413);
    expect(res.json).toEqual({ error: 'payload_too_large', message: 'Request body too large' });
  });

  it('cannot be used to write outside the projects directory', async () => {
    const project = await createAdHoc('../../escape');
    expect(project.name).toBe('escape');
    expect(project.path).toBe(join(app.projectsDir, 'escape'));
  });
});

describe('environment variables', () => {
  it.each([
    ['newline in key', 'A=1\nB'],
    ['equals sign', 'A=B'],
    ['leading digit', '1ABC'],
    ['space', 'MY VAR'],
    ['shell metacharacters', 'A;rm'],
    ['over 256 chars', 'K'.repeat(257)],
  ])('rejects an invalid key (%s) on create and update', async (_n, key) => {
    const create = await api('/api/projects/ad-hoc', 'POST', {
      name: 'envtest',
      composeContent: COMPOSE,
      envVars: [{ key, value: 'v' }],
    });
    expect(create.status).toBe(400);

    const project = await createAdHoc('ok');
    const update = await api(`/api/projects/${project.id}/env`, 'PUT', { envVars: [{ key, value: 'v' }] });
    expect(update.status).toBe(400);
    await expect(fs.access(join(project.path, '.env'))).rejects.toThrow();
  });

  it('accepts conventional names and trims surrounding whitespace', async () => {
    const project = await createAdHoc('envok');
    const res = await api(`/api/projects/${project.id}/env`, 'PUT', {
      envVars: [
        { key: ' DATABASE_URL ', value: 'postgres://u:p@db/x' },
        { key: '_private', value: 'y' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true, id: project.id });
    expect(await fs.readFile(join(project.path, '.env'), 'utf8')).toBe(
      'DATABASE_URL=postgres://u:p@db/x\n_private=y\n',
    );
  });

  it('rejects values over 8KB', async () => {
    const project = await createAdHoc('bigval');
    const res = await api(`/api/projects/${project.id}/env`, 'PUT', {
      envVars: [{ key: 'BIG', value: 'x'.repeat(8193) }],
    });
    expect(res.status).toBe(400);
  });

  it('answers 404 for an unknown project', async () => {
    const res = await api('/api/projects/nope/env', 'PUT', { envVars: [] });
    expect(res.status).toBe(404);
    expect(res.json.error).toBe('not_found');
  });
});

describe('clone validation', () => {
  it.each([
    ['not a url', 'definitely not a url'],
    ['empty', ''],
    ['option-like value', '--upload-pack=touch /tmp/pwned'],
    ['option smuggled through the ssh pattern', '-oProxyCommand@host:repo'],
  ])('rejects %s before touching git', async (_n, cloneUrl) => {
    const res = await api('/api/projects', 'POST', { cloneUrl });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('validation_error');
  });

  it("refuses to clone the dashboard's own repo", async () => {
    const res = await api('/api/projects', 'POST', { cloneUrl: 'https://github.com/me/portwatch.git' });
    expect(res.status).toBe(409);
  });
});

describe('compose files', () => {
  it('reads the registered compose file', async () => {
    const project = await createAdHoc('readme');
    const res = await api(`/api/projects/${project.id}/compose`);
    expect(res.status).toBe(200);
    expect(res.json.compose).toEqual({ relPath: 'docker-compose.yml', content: COMPOSE });
  });

  it.each(['../secret', '../../etc/passwd', '/etc/passwd'])(
    'refuses to read %s through relPath',
    async (relPath) => {
      const project = await createAdHoc('trav');
      const res = await api(`/api/projects/${project.id}/compose?relPath=${encodeURIComponent(relPath)}`);
      expect(res.status).toBe(404);
      expect(res.json.message).toMatch(/escapes project directory/);
    },
  );

  it('refuses to write outside the project and leaves the file system untouched', async () => {
    const project = await createAdHoc('trav2');
    const res = await api(`/api/projects/${project.id}/compose`, 'PUT', {
      content: 'pwned',
      relPath: '../pwned.yml',
    });
    expect(res.status).toBe(404);
    await expect(fs.access(join(app.projectsDir, 'pwned.yml'))).rejects.toThrow();
  });

  it('answers 404 for an unknown project and 409 for the dashboard itself', async () => {
    expect((await api('/api/projects/nope/compose')).status).toBe(404);
    expect((await api('/api/projects/nope/compose', 'PUT', { content: 'x' })).status).toBe(404);

    await app.wiring.ports.projects.upsert(makeProject({ id: 'self', name: 'portwatch', path: join(app.projectsDir, 'portwatch') }));
    const res = await api('/api/projects/self/compose', 'PUT', { content: 'services: {}' });
    expect(res.status).toBe(409);
  });

  it('accepts compose edits above the 256KB global limit (route-level 1MB parser) up to 512KB', async () => {
    const project = await createAdHoc('size');
    const big = 'a'.repeat(300_000);
    const ok = await api(`/api/projects/${project.id}/compose`, 'PUT', { content: big });
    expect(ok.status).toBe(200);
    expect(ok.json).toEqual({ exitCode: 0 });
    expect(await fs.readFile(join(project.path, 'docker-compose.yml'), 'utf8')).toBe(big);

    const tooBig = await api(`/api/projects/${project.id}/compose`, 'PUT', { content: 'a'.repeat(524289) });
    expect(tooBig.status).toBe(400);
    expect(tooBig.json.error).toBe('validation_error');
  });

  it('rejects compose edits over the 1MB route limit with 413', async () => {
    const project = await createAdHoc('huge');
    const res = await api(`/api/projects/${project.id}/compose`, 'PUT', { content: 'a'.repeat(1_100_000) });
    expect(res.status).toBe(413);
  });
});

describe('deployments', () => {
  it('lists an empty history for a project that never deployed', async () => {
    const project = await createAdHoc('hist');
    const res = await api(`/api/projects/${project.id}/deployments`);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ deployments: [] });
  });

  it('answers 404 when deploying an unknown project', async () => {
    const res = await api('/api/projects/nope/deploy', 'POST');
    expect(res.status).toBe(404);
  });

  it('refuses to deploy the dashboard itself and records nothing', async () => {
    await app.wiring.ports.projects.upsert(makeProject({ id: 'self', name: 'portwatch' }));
    const res = await api('/api/projects/self/deploy', 'POST');
    expect(res.status).toBe(409);
    expect((await api('/api/projects/self/deployments')).json.deployments).toEqual([]);
  });
});

describe('deleting', () => {
  it('unregisters the project and removes its directory', async () => {
    const project = await createAdHoc('gone');
    const res = await api(`/api/projects/${project.id}`, 'DELETE');
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true, id: project.id });
    expect((await api('/api/projects')).json.projects).toEqual([]);
    await expect(fs.access(project.path)).rejects.toThrow();
  });

  it('answers 404 for an unknown project', async () => {
    expect((await api('/api/projects/nope', 'DELETE')).status).toBe(404);
  });
});
