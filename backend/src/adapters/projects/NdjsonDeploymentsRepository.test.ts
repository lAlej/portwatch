import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Deployment } from '../../domain/entities/Deployment.js';
import { makeTmpDir, removeDir } from '../../testing/fakes.js';
import { NdjsonDeploymentsRepository } from './NdjsonDeploymentsRepository.js';

function dep(overrides: Partial<Deployment> = {}): Deployment {
  return {
    id: 'd1',
    projectId: 'p1',
    status: 'queued',
    startedAt: 1000,
    finishedAt: null,
    exitCode: null,
    ...overrides,
  };
}

describe('NdjsonDeploymentsRepository', () => {
  let root: string;
  let repo: NdjsonDeploymentsRepository;

  beforeEach(async () => {
    root = await makeTmpDir();
    repo = new NdjsonDeploymentsRepository(join(root, 'nested', 'projects'));
  });
  afterEach(() => removeDir(root));

  it('creates the storage directory on first use', async () => {
    expect(await repo.getByProject('p1')).toEqual([]);
    await expect(fs.access(join(root, 'nested', 'projects', '.deployments.ndjson'))).resolves.toBeUndefined();
  });

  it('appends one JSON line per deployment', async () => {
    await repo.append(dep({ id: 'a' }));
    await repo.append(dep({ id: 'b' }));
    const raw = await fs.readFile(join(root, 'nested', 'projects', '.deployments.ndjson'), 'utf8');
    expect(raw.trim().split('\n').map((l) => (JSON.parse(l) as Deployment).id)).toEqual(['a', 'b']);
  });

  it('update replaces the matching record in place', async () => {
    await repo.append(dep({ id: 'a' }));
    await repo.append(dep({ id: 'b', startedAt: 2000 }));
    await repo.update(dep({ id: 'a', status: 'success', exitCode: 0, finishedAt: 1500 }));

    const all = await repo.getByProject('p1');
    expect(all.find((d) => d.id === 'a')).toMatchObject({ status: 'success', exitCode: 0 });
    expect(all).toHaveLength(2);
  });

  it('update inserts the record when it was never appended', async () => {
    await repo.update(dep({ id: 'new' }));
    expect((await repo.getByProject('p1')).map((d) => d.id)).toEqual(['new']);
  });

  it('returns only the project deployments, newest first, honouring the limit', async () => {
    await repo.append(dep({ id: 'old', startedAt: 1 }));
    await repo.append(dep({ id: 'other', projectId: 'p2', startedAt: 5 }));
    await repo.append(dep({ id: 'mid', startedAt: 2 }));
    await repo.append(dep({ id: 'new', startedAt: 3 }));

    expect((await repo.getByProject('p1')).map((d) => d.id)).toEqual(['new', 'mid', 'old']);
    expect((await repo.getByProject('p1', 2)).map((d) => d.id)).toEqual(['new', 'mid']);
  });

  it('defaults to 20 entries', async () => {
    for (let i = 0; i < 25; i++) await repo.append(dep({ id: `d${i}`, startedAt: i }));
    expect(await repo.getByProject('p1')).toHaveLength(20);
  });

  it('ignores blank and malformed lines instead of failing', async () => {
    await repo.append(dep({ id: 'ok' }));
    await fs.appendFile(join(root, 'nested', 'projects', '.deployments.ndjson'), '\n{broken\n   \n', 'utf8');
    expect((await repo.getByProject('p1')).map((d) => d.id)).toEqual(['ok']);
  });

  describe('concurrent writers (parallel deploys)', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `c${i}`);

    it('keeps every record when appends overlap', async () => {
      await Promise.all(ids.map((id, i) => repo.append(dep({ id, startedAt: i }))));
      expect(await repo.getByProject('p1', 100)).toHaveLength(20);
    });

    it('applies every update when updates overlap', async () => {
      await Promise.all(ids.map((id, i) => repo.append(dep({ id, startedAt: i }))));
      await Promise.all(ids.map((id, i) => repo.update(dep({ id, startedAt: i, status: 'success', exitCode: 0 }))));

      const all = await repo.getByProject('p1', 100);
      expect(all).toHaveLength(20);
      expect(all.every((d) => d.status === 'success')).toBe(true);
    });

    it('does not lose an append that races with an update', async () => {
      await repo.append(dep({ id: 'base' }));
      await Promise.all([
        repo.update(dep({ id: 'base', status: 'success' })),
        repo.append(dep({ id: 'late', startedAt: 5 })),
        repo.update(dep({ id: 'late', startedAt: 5, status: 'failed' })),
      ]);

      const all = await repo.getByProject('p1');
      expect(all.map((d) => [d.id, d.status]).sort()).toEqual([
        ['base', 'success'],
        ['late', 'failed'],
      ]);
    });

    it('keeps accepting writes after one of them fails', async () => {
      const broken = new NdjsonDeploymentsRepository(join(root, 'file-not-dir'));
      await fs.writeFile(join(root, 'file-not-dir'), 'x', 'utf8'); // projectsDir is a file -> mkdir fails
      await expect(broken.append(dep())).rejects.toThrow();
      await expect(broken.append(dep())).rejects.toThrow(); // still rejects, queue not poisoned/hung

      await expect(repo.append(dep({ id: 'fine' }))).resolves.toBeUndefined();
    });
  });
});
