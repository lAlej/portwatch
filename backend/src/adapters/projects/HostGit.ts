import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { Git } from '../../domain/ports/Git.js';
import type { Logger } from '../../domain/ports/Logger.js';
import { spawnOnce, spawnStream, type Line } from './spawnStream.js';

const BASE_GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_PAGER: 'cat',
  LC_ALL: 'C.UTF-8',
};

// Set by fixSshKeyPermissions() once at boot. Applied on top of
// BASE_GIT_ENV every time we spawn git/ssh so a single declaration
// site keeps all commands in sync.
let gitSshCommand: string | undefined;

function gitEnv(): NodeJS.ProcessEnv {
  if (!gitSshCommand) return BASE_GIT_ENV;
  return { ...BASE_GIT_ENV, GIT_SSH_COMMAND: gitSshCommand };
}

function formatEnvLine(key: string, value: string): string {
  if (value === '') return `${key}=`;
  if (/[\s"'$`\\#]/.test(value)) {
    const escaped = value.replace(/(?=['"\\])/g, '\\').replace(/\n/g, '\\n');
    return `${key}="${escaped}"`;
  }
  return `${key}=${value}`;
}

export class HostGit implements Git {
  async clone(url: string, dest: string): Promise<void> {
    await spawnOnce('git', ['clone', '--depth', '1', url, dest], { env: gitEnv() });
  }

  pull(cwd: string): AsyncIterable<Line> {
    return spawnStream('git', ['pull', '--ff-only'], { cwd, env: gitEnv() });
  }

  async hasDockerfile(cwd: string): Promise<boolean> {
    try {
      const st = await fs.stat(join(cwd, 'Dockerfile'));
      return st.isFile();
    } catch {
      return false;
    }
  }

  async findComposeFile(cwd: string): Promise<string | null> {
    for (const name of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
      try {
        const st = await fs.stat(join(cwd, name));
        if (st.isFile()) return name;
      } catch {
        /* try next */
      }
    }
    return null;
  }

  async removeDir(path: string): Promise<void> {
    await fs.rm(path, { recursive: true, force: true });
  }

  async writeEnvFile(cwd: string, vars: { key: string; value: string }[]): Promise<void> {
    const lines = vars
      .filter((v) => v.key.trim().length > 0)
      .map((v) => formatEnvLine(v.key.trim(), v.value));
    await fs.writeFile(join(cwd, '.env'), lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
  }
}

const SOURCE_SSH_DIR = '/root/.ssh';
const MIRROR_SSH_DIR = '/tmp/portwatch-ssh';

export async function fixSshKeyPermissions(logger: Logger): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(SOURCE_SSH_DIR);
  } catch {
    return;
  }

  await fs.mkdir(MIRROR_SSH_DIR, { recursive: true });
  await fs.chmod(MIRROR_SSH_DIR, 0o700);

  for (const name of entries) {
    if (name === '.' || name === '..') continue;
    const src = join(SOURCE_SSH_DIR, name);
    const dst = join(MIRROR_SSH_DIR, name);
    try {
      const st = await fs.stat(src);
      if (!st.isFile()) continue;
      const content = await fs.readFile(src);
      await fs.writeFile(dst, content);
      // Private keys: 0600. Public keys + known_hosts: 0644.
      const mode = name.endsWith('.pub') || name === 'known_hosts' || name === 'config' ? 0o644 : 0o600;
      await fs.chmod(dst, mode);
    } catch (err) {
      logger.warn('failed to mirror ssh file', {
        src,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Point git/SSH at the mirror. ssh reads known_hosts from ~/.ssh by
  // default; GIT_SSH_COMMAND overrides that to use the writable copy.
  gitSshCommand = `ssh -i ${MIRROR_SSH_DIR}/id_ed25519 -o UserKnownHostsFile=${MIRROR_SSH_DIR}/known_hosts -o StrictHostKeyChecking=accept-new`;
}

// Re-export for callers that want to know which dir to use.
export const MIRRORED_SSH_DIR = MIRROR_SSH_DIR;

