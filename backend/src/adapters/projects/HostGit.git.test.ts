import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  spawnOnce: vi.fn(async () => undefined),
  spawnStream: vi.fn(() => (async function* () {})()),
}));
vi.mock('./spawnStream.js', () => mocks);

import { HostGit } from './HostGit.js';

describe('HostGit (git invocations)', () => {
  const git = new HostGit();
  beforeEach(() => {
    mocks.spawnOnce.mockClear();
    mocks.spawnStream.mockClear();
  });

  it('clones shallowly and terminates options with -- so the url can never be an option', async () => {
    await git.clone('https://example.com/me/app.git', '/projects/app');

    const [cmd, args] = mocks.spawnOnce.mock.calls[0] as unknown as [string, string[]];
    expect(cmd).toBe('git');
    expect(args).toEqual(['clone', '--depth', '1', '--', 'https://example.com/me/app.git', '/projects/app']);
  });

  it('passes a hostile-looking url as one literal argument after --', async () => {
    await git.clone('--upload-pack=touch /tmp/pwned', '/projects/x');
    const [, args] = mocks.spawnOnce.mock.calls[0] as unknown as [string, string[]];
    expect(args.indexOf('--')).toBeLessThan(args.indexOf('--upload-pack=touch /tmp/pwned'));
  });

  it('never blocks waiting for credentials or a pager', async () => {
    await git.clone('https://example.com/a.git', '/projects/a');
    const [, , opts] = mocks.spawnOnce.mock.calls[0] as unknown as [string, string[], { env: NodeJS.ProcessEnv }];
    expect(opts.env).toMatchObject({ GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat' });
  });

  it('pulls fast-forward only, in the project directory', () => {
    git.pull('/projects/app');
    const [cmd, args, opts] = mocks.spawnStream.mock.calls[0] as unknown as [
      string,
      string[],
      { cwd: string; env: NodeJS.ProcessEnv },
    ];
    expect(cmd).toBe('git');
    expect(args).toEqual(['pull', '--ff-only']);
    expect(opts.cwd).toBe('/projects/app');
    expect(opts.env.GIT_TERMINAL_PROMPT).toBe('0');
  });

  it('propagates clone failures to the caller', async () => {
    mocks.spawnOnce.mockRejectedValueOnce(new Error('Permission denied (publickey)'));
    await expect(git.clone('git@github.com:me/private.git', '/projects/p')).rejects.toThrow(
      'Permission denied (publickey)',
    );
  });
});
