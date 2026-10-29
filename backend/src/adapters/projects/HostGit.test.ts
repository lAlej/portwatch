import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTmpDir, removeDir } from '../../testing/fakes.js';
import { HostGit } from './HostGit.js';

describe('HostGit (filesystem helpers)', () => {
  let dir: string;
  const git = new HostGit();

  beforeEach(async () => {
    dir = await makeTmpDir();
  });
  afterEach(() => removeDir(dir));

  describe('hasDockerfile', () => {
    it('is true only for a regular file named Dockerfile', async () => {
      expect(await git.hasDockerfile(dir)).toBe(false);
      await fs.writeFile(join(dir, 'Dockerfile'), 'FROM scratch', 'utf8');
      expect(await git.hasDockerfile(dir)).toBe(true);
    });

    it('is false when Dockerfile is a directory', async () => {
      await fs.mkdir(join(dir, 'Dockerfile'));
      expect(await git.hasDockerfile(dir)).toBe(false);
    });

    it('is false for a directory that does not exist', async () => {
      expect(await git.hasDockerfile(join(dir, 'missing'))).toBe(false);
    });
  });

  describe('findComposeFile', () => {
    it('returns null when there is no compose file', async () => {
      expect(await git.findComposeFile(dir)).toBeNull();
    });

    it.each(['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'])(
      'finds %s',
      async (name) => {
        await fs.writeFile(join(dir, name), 'services: {}', 'utf8');
        expect(await git.findComposeFile(dir)).toBe(name);
      },
    );

    it('prefers docker-compose.yml over the other spellings', async () => {
      for (const n of ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml']) {
        await fs.writeFile(join(dir, n), '', 'utf8');
      }
      expect(await git.findComposeFile(dir)).toBe('docker-compose.yml');
    });

    it('ignores a directory with a compose-like name', async () => {
      await fs.mkdir(join(dir, 'docker-compose.yml'));
      expect(await git.findComposeFile(dir)).toBeNull();
    });
  });

  describe('removeDir', () => {
    it('removes a tree recursively and tolerates a missing path', async () => {
      await fs.mkdir(join(dir, 'a', 'b'), { recursive: true });
      await fs.writeFile(join(dir, 'a', 'b', 'f.txt'), 'x', 'utf8');
      await git.removeDir(join(dir, 'a'));
      await expect(fs.access(join(dir, 'a'))).rejects.toThrow();
      await expect(git.removeDir(join(dir, 'never-existed'))).resolves.toBeUndefined();
    });
  });

  describe('writeEnvFile', () => {
    const read = () => fs.readFile(join(dir, '.env'), 'utf8');

    it('writes KEY=value lines terminated by a newline', async () => {
      await git.writeEnvFile(dir, [
        { key: 'A', value: '1' },
        { key: 'URL', value: 'https://x.test/path?q=1' },
      ]);
      expect(await read()).toBe('A=1\nURL=https://x.test/path?q=1\n');
    });

    it('writes an empty file for no variables and drops blank keys', async () => {
      await git.writeEnvFile(dir, [{ key: '  ', value: 'x' }]);
      expect(await read()).toBe('');
    });

    it('trims keys', async () => {
      await git.writeEnvFile(dir, [{ key: '  TOKEN ', value: 'v' }]);
      expect(await read()).toBe('TOKEN=v\n');
    });

    it('writes an empty value as KEY=', async () => {
      await git.writeEnvFile(dir, [{ key: 'EMPTY', value: '' }]);
      expect(await read()).toBe('EMPTY=\n');
    });

    it('quotes values with whitespace or comment characters', async () => {
      await git.writeEnvFile(dir, [
        { key: 'SPACED', value: 'hello world' },
        { key: 'HASH', value: 'a#b' },
      ]);
      expect(await read()).toBe('SPACED="hello world"\nHASH="a#b"\n');
    });

    it('escapes double quotes and backslashes inside quoted values', async () => {
      await git.writeEnvFile(dir, [{ key: 'Q', value: 'say "hi" \\ bye' }]);
      expect(await read()).toBe('Q="say \\"hi\\" \\\\ bye"\n');
    });

    it('keeps a multi-line value on a single physical line', async () => {
      await git.writeEnvFile(dir, [{ key: 'PEM', value: 'line1\nline2' }]);
      const content = await read();
      expect(content).toBe('PEM="line1\\nline2"\n');
      expect(content.trimEnd().split('\n')).toHaveLength(1);
    });

    it('cannot be tricked into defining a second variable via the value', async () => {
      await git.writeEnvFile(dir, [{ key: 'A', value: 'x\nINJECTED=1' }]);
      const defined = (await read()).split('\n').filter(Boolean);
      expect(defined).toHaveLength(1);
      expect(defined[0]).toMatch(/^A=/);
    });

    it.todo('escapes $ so docker compose does not interpolate it inside double quotes');
  });
});
