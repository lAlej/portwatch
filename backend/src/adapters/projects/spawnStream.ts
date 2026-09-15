import { spawn, type ChildProcess } from 'node:child_process';

export type StreamKind = 'stdout' | 'stderr';
export type Line = { line: string; stream: StreamKind };

// Docker emits infrastructure-level warnings (buildx missing, deprecated
// features, etc.) that look like errors to the user but aren't actionable
// from this app. Filter them so the deploy log only shows what matters.
const SUPPRESSED_PATTERNS: RegExp[] = [
  /Docker Compose requires buildx plugin to be installed/,
  /level=warning msg=".*buildx.*"/,
];

function shouldSuppress(line: string): boolean {
  return SUPPRESSED_PATTERNS.some((re) => re.test(line));
}

function emitLines(chunk: string, stream: StreamKind, cb: (l: Line) => void): void {
  for (const l of chunk.split('\n')) {
    if (l.length === 0) continue;
    const cleaned = l.replace(/\r$/, '');
    if (shouldSuppress(cleaned)) continue;
    cb({ line: cleaned, stream });
  }
}

export interface SpawnStreamOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export async function* spawnStream(
  cmd: string,
  args: string[],
  opts: SpawnStreamOptions = {},
): AsyncIterable<Line> {
  type Item = Line | null;
  const queue: Item[] = [];
  let waiter: ((v: IteratorResult<Item>) => void) | null = null;
  let done = false;
  let exitCode: number | null = null;
  let exitStderr = '';

  const push = (item: Item): void => {
    if (waiter) {
      const w = waiter; waiter = null;
      w({ value: item, done: item === null });
    } else if (item !== null) {
      queue.push(item);
    }
  };

  let child!: ChildProcess;
  try {
    child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'spawn failed');
  }

  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => emitLines(chunk, 'stdout', (l) => push(l)));
  child.stderr?.on('data', (chunk: string) => {
    exitStderr += chunk;
    emitLines(chunk, 'stderr', (l) => push(l));
  });
  child.on('exit', (code) => {
    exitCode = code;
    done = true;
    push(null);
  });
  child.on('error', (err) => {
    exitCode = 1;
    done = true;
    exitStderr += err.message;
    push(null);
  });

  try {
    while (true) {
      if (queue.length > 0) {
        const item = queue.shift()!;
        if (item === null) break;
        yield item;
      } else if (done) {
        break;
      } else {
        const next = await new Promise<IteratorResult<Item>>((r) => { waiter = r; });
        if (next.done) break;
        yield next.value as Line;
      }
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }

  if (exitCode !== 0) throw new Error(exitStderr.trim() || `exit ${exitCode}`);
}

export async function spawnOnce(
  cmd: string,
  args: string[],
  opts: SpawnStreamOptions & { onLine?: (l: Line) => void } = {},
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let stderr = '';
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      if (opts.onLine) emitLines(chunk, 'stdout', opts.onLine);
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
      if (opts.onLine) emitLines(chunk, 'stderr', opts.onLine);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `exit ${code}`));
    });
  });
}
