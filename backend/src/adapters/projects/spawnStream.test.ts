import { mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTmpDir, removeDir } from '../../testing/fakes.js';
import { spawnOnce, spawnStream, type Line } from './spawnStream.js';

// Child processes are the current Node binary, so the tests run the same on
// every OS and need no external tools.
const NODE = process.execPath;
const node = (script: string): [string, string[]] => [NODE, ['-e', script]];

async function collect(iter: AsyncIterable<Line>): Promise<Line[]> {
  const out: Line[] = [];
  for await (const l of iter) out.push(l);
  return out;
}

describe('spawnStream', () => {
  it('yields stdout and stderr lines tagged with their stream', async () => {
    const lines = await collect(
      spawnStream(...node("console.log('out1'); console.error('err1'); console.log('out2')")),
    );
    expect(lines.filter((l) => l.stream === 'stdout').map((l) => l.line)).toEqual(['out1', 'out2']);
    expect(lines.filter((l) => l.stream === 'stderr').map((l) => l.line)).toEqual(['err1']);
  });

  it('strips CRLF endings and skips blank lines', async () => {
    const lines = await collect(spawnStream(...node("process.stdout.write('a\\r\\n\\r\\n\\nb\\r\\n')")));
    expect(lines.map((l) => l.line)).toEqual(['a', 'b']);
  });

  it('suppresses the known docker/buildx noise but keeps real output', async () => {
    const lines = await collect(
      spawnStream(
        ...node(
          "console.error('Docker Compose requires buildx plugin to be installed'); " +
            "console.error('level=warning msg=\"buildx is missing\"'); " +
            "console.error('a real warning')",
        ),
      ),
    );
    expect(lines.map((l) => l.line)).toEqual(['a real warning']);
  });

  it('throws with the trimmed stderr when the process exits non-zero', async () => {
    const run = collect(spawnStream(...node("console.error('boom happened'); process.exit(3)")));
    await expect(run).rejects.toThrow('boom happened');
  });

  it('falls back to the exit code when nothing was written to stderr', async () => {
    await expect(collect(spawnStream(...node('process.exit(7)')))).rejects.toThrow('exit 7');
  });

  it('still delivers the output printed before a failure', async () => {
    const seen: string[] = [];
    const run = (async () => {
      for await (const l of spawnStream(...node("console.log('progress'); process.exit(1)"))) {
        seen.push(l.line);
      }
    })();
    await expect(run).rejects.toThrow();
    expect(seen).toEqual(['progress']);
  });

  it('rejects when the command cannot be started', async () => {
    await expect(collect(spawnStream('definitely-not-a-real-command-xyz', []))).rejects.toThrow();
  });

  it('passes arguments verbatim without a shell (no injection)', async () => {
    const payload = '"; echo pwned; #';
    const lines = await collect(
      spawnStream(NODE, ['-e', 'console.log(process.argv[1])', payload]),
    );
    expect(lines.map((l) => l.line)).toEqual([payload]);
  });

  it('uses the given env instead of inheriting the parent one', async () => {
    const lines = await collect(
      spawnStream(...node("console.log(process.env.PW_TEST_VAR ?? 'unset')"), {
        env: { ...process.env, PW_TEST_VAR: 'custom' },
      }),
    );
    expect(lines.map((l) => l.line)).toEqual(['custom']);
  });

  it('kills the child when the consumer stops iterating early', async () => {
    const started = Date.now();
    const it = spawnStream(
      ...node("console.log('first'); setInterval(() => console.log('tick'), 50); setTimeout(() => {}, 60000)"),
    )[Symbol.asyncIterator]();
    const first = await it.next();
    expect(first.value).toEqual({ line: 'first', stream: 'stdout' });
    await it.return?.();
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  describe('cwd', () => {
    let dir: string;
    beforeEach(async () => {
      dir = await makeTmpDir();
      await mkdir(join(dir, 'sub'));
    });
    afterEach(() => removeDir(dir));

    it('runs in the requested working directory', async () => {
      const lines = await collect(spawnStream(...node('console.log(process.cwd())'), { cwd: join(dir, 'sub') }));
      expect(await realpath(lines[0]!.line)).toBe(await realpath(join(dir, 'sub')));
    });
  });
});

describe('spawnOnce', () => {
  it('resolves on exit code 0 and reports lines through onLine', async () => {
    const seen: Line[] = [];
    await spawnOnce(...node("console.log('hi'); console.error('warn')"), { onLine: (l) => seen.push(l) });
    expect(seen).toEqual(
      expect.arrayContaining([
        { line: 'hi', stream: 'stdout' },
        { line: 'warn', stream: 'stderr' },
      ]),
    );
  });

  it('rejects with stderr on a non-zero exit', async () => {
    await expect(spawnOnce(...node("console.error('nope'); process.exit(2)"))).rejects.toThrow('nope');
  });

  it('rejects with the exit code when stderr is empty', async () => {
    await expect(spawnOnce(...node('process.exit(9)'))).rejects.toThrow('exit 9');
  });

  it('rejects when the command does not exist', async () => {
    await expect(spawnOnce('definitely-not-a-real-command-xyz', [])).rejects.toThrow();
  });
});
