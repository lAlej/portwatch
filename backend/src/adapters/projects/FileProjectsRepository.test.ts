import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../../lib/errors.js';
import { makeProject, makeTmpDir, removeDir } from '../../testing/fakes.js';
import { FileProjectsRepository } from './FileProjectsRepository.js';

describe('FileProjectsRepository', () => {
  let root: string;
  let repo: FileProjectsRepository;

  beforeEach(async () => {
    root = await makeTmpDir();
    repo = new FileProjectsRepository(root);
  });
  afterEach(() => removeDir(root));

  describe('persistence', () => {
    it('round-trips a project through upsert and get', async () => {
      const p = makeProject({ envVars: [{ key: 'A', value: '1' }] });
      await repo.upsert(p);
      expect(await repo.get(p.id)).toEqual(p);
    });

    it('overwrites on upsert with the same id and leaves no temp file', async () => {
      await repo.upsert(makeProject({ composeFile: 'a.yml' }));
      await repo.upsert(makeProject({ composeFile: 'b.yml' }));
      expect((await repo.get('p1'))?.composeFile).toBe('b.yml');
      expect(await fs.readdir(join(root, '.projects'))).toEqual(['p1.json']);
    });

    it('returns null for a project that does not exist', async () => {
      expect(await repo.get('nope')).toBeNull();
    });

    it('lists every project and finds one by name', async () => {
      await repo.upsert(makeProject({ id: 'a', name: 'alpha' }));
      await repo.upsert(makeProject({ id: 'b', name: 'beta' }));
      expect((await repo.list()).map((p) => p.id).sort()).toEqual(['a', 'b']);
      expect((await repo.getByName('beta'))?.id).toBe('b');
      expect(await repo.getByName('gamma')).toBeNull();
    });

    it('removes a project and tolerates removing a missing one', async () => {
      await repo.upsert(makeProject());
      await repo.remove('p1');
      await repo.remove('p1');
      expect(await repo.get('p1')).toBeNull();
      expect(await repo.list()).toEqual([]);
    });

    it('skips corrupted and non-json files when listing', async () => {
      await repo.upsert(makeProject({ id: 'ok' }));
      await fs.writeFile(join(root, '.projects', 'broken.json'), '{not json', 'utf8');
      await fs.writeFile(join(root, '.projects', 'notes.txt'), 'hi', 'utf8');
      expect((await repo.list()).map((p) => p.id)).toEqual(['ok']);
    });

    it('backfills fields missing from records written by older versions', async () => {
      await repo.list(); // creates the directory
      const legacy = { id: 'old', name: 'old', path: '/projects/old', composeFile: '', hasDockerfile: true, createdAt: 1 };
      await fs.writeFile(join(root, '.projects', 'old.json'), JSON.stringify(legacy), 'utf8');

      expect(await repo.get('old')).toMatchObject({ cloneUrl: '', envVars: [] });
      expect((await repo.list())[0]).toMatchObject({ cloneUrl: '', envVars: [] });
    });
  });

  describe('compose files', () => {
    let projectDir: string;
    beforeEach(async () => {
      projectDir = join(root, 'my-app');
      await fs.mkdir(join(projectDir, 'deploy'), { recursive: true });
    });

    const project = () => makeProject({ path: projectDir });

    it('reads the registered compose file by default', async () => {
      await fs.writeFile(join(projectDir, 'docker-compose.yml'), 'services: {}', 'utf8');
      expect(await repo.readComposeFile(project())).toEqual({
        relPath: 'docker-compose.yml',
        content: 'services: {}',
      });
    });

    it('reads a nested file through relPath', async () => {
      await fs.writeFile(join(projectDir, 'deploy', 'prod.yml'), 'x: 1', 'utf8');
      expect(await repo.readComposeFile(project(), 'deploy/prod.yml')).toEqual({
        relPath: 'deploy/prod.yml',
        content: 'x: 1',
      });
    });

    it('writes atomically and replaces the previous content', async () => {
      await repo.writeComposeFile(project(), 'one');
      await repo.writeComposeFile(project(), 'two');
      expect(await fs.readFile(join(projectDir, 'docker-compose.yml'), 'utf8')).toBe('two');
      expect(await fs.readdir(projectDir)).not.toContain('docker-compose.yml.tmp');
    });

    it('throws NotFoundError when the file is missing on disk', async () => {
      await expect(repo.readComposeFile(project())).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError when the project has no compose file configured', async () => {
      await expect(repo.readComposeFile(makeProject({ path: projectDir, composeFile: '' }))).rejects.toThrow(
        /no compose file configured/,
      );
    });

    describe('path traversal', () => {
      it.each([
        '../secret.yml',
        '../../etc/passwd',
        'deploy/../../outside.yml',
        '/etc/passwd',
        '../my-app-evil/docker-compose.yml', // sibling sharing the directory prefix
      ])('rejects reading %s', async (rel) => {
        await expect(repo.readComposeFile(project(), rel)).rejects.toThrow(/escapes project directory/);
      });

      it('rejects writing outside the project and writes nothing', async () => {
        await expect(repo.writeComposeFile(project(), 'pwned', '../pwned.yml')).rejects.toBeInstanceOf(
          NotFoundError,
        );
        await expect(fs.access(join(root, 'pwned.yml'))).rejects.toThrow();
      });

      it('still allows .. segments that stay inside the project', async () => {
        await fs.writeFile(join(projectDir, 'docker-compose.yml'), 'ok', 'utf8');
        expect((await repo.readComposeFile(project(), 'deploy/../docker-compose.yml')).content).toBe('ok');
      });
    });
  });
});
