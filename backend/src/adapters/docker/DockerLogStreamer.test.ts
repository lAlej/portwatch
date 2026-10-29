import type Dockerode from 'dockerode';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogLine } from '../../domain/ports/LogStreamer.js';
import { DockerLogStreamer } from './DockerLogStreamer.js';

/** One Docker multiplexed-stream frame: 8-byte header + payload. */
function frame(type: 1 | 2, payload: string | Buffer): Buffer {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  const header = Buffer.alloc(8);
  header[0] = type;
  header.writeUInt32BE(data.length, 4);
  return Buffer.concat([header, data]);
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

interface Harness {
  streams: PassThrough[];
  logs: ReturnType<typeof vi.fn>;
  lines: LogLine[];
  texts: () => string[];
  start: (opts?: { tail?: number; since?: number }) => () => void;
  /** Resolves once the n-th `logs()` stream has been attached. */
  attached: (n?: number) => Promise<PassThrough>;
}

function harness(): Harness {
  const streams: PassThrough[] = [];
  const logs = vi.fn(async () => {
    const s = new PassThrough();
    streams.push(s);
    return s;
  });
  const docker = { getContainer: vi.fn(() => ({ logs })) } as unknown as Dockerode;
  const lines: LogLine[] = [];
  const streamer = new DockerLogStreamer(docker);
  return {
    streams,
    logs,
    lines,
    texts: () => lines.map((l) => l.data),
    start: (opts = {}) => streamer.stream('c1', opts, (l) => lines.push(l)),
    attached: async (n = 1) => {
      await vi.waitFor(() => expect(streams.length).toBeGreaterThanOrEqual(n));
      await tick();
      return streams[n - 1]!;
    },
  };
}

describe('DockerLogStreamer', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  describe('multiplexed (non-TTY) streams', () => {
    it('emits one line per newline, tagged with the right stream', async () => {
      const stop = h.start();
      const s = await h.attached();

      s.write(Buffer.concat([frame(1, 'hello\nworld\n'), frame(2, 'oops\n')]));
      await tick();

      expect(h.lines.map((l) => [l.stream, l.data])).toEqual([
        ['stdout', 'hello\n'],
        ['stdout', 'world\n'],
        ['stderr', 'oops\n'],
      ]);
      expect(h.lines.every((l) => l.id === 'c1')).toBe(true);
      stop();
    });

    it('joins a line that is split across frames and across chunks', async () => {
      const stop = h.start();
      const s = await h.attached();

      s.write(frame(1, 'par'));
      await tick();
      expect(h.lines).toHaveLength(0); // incomplete line is held back
      s.write(frame(1, 'tial line\nnext'));
      await tick();
      s.write(frame(1, ' one\n'));
      await tick();

      expect(h.texts()).toEqual(['partial line\n', 'next one\n']);
      stop();
    });

    it('reassembles a frame whose payload arrives in several chunks', async () => {
      const stop = h.start();
      const s = await h.attached();
      const whole = frame(1, 'a fairly long single log line\n');

      s.write(whole.subarray(0, 12));
      await tick();
      s.write(whole.subarray(12, 20));
      await tick();
      s.write(whole.subarray(20));
      await tick();

      expect(h.texts()).toEqual(['a fairly long single log line\n']);
      stop();
    });

    it('reassembles a frame header that is split between chunks', async () => {
      const stop = h.start();
      const s = await h.attached();
      const first = frame(1, 'first\n');
      const second = frame(1, 'second\n');

      s.write(first);
      s.write(second.subarray(0, 3)); // 3 of the 8 header bytes
      await tick();
      s.write(second.subarray(3));
      await tick();

      expect(h.texts()).toEqual(['first\n', 'second\n']);
      stop();
    });

    it('keeps stdout and stderr partial lines separate', async () => {
      const stop = h.start();
      const s = await h.attached();

      s.write(Buffer.concat([frame(1, 'out-'), frame(2, 'err-'), frame(1, 'done\n'), frame(2, 'done\n')]));
      await tick();

      expect(h.lines.map((l) => [l.stream, l.data])).toEqual([
        ['stdout', 'out-done\n'],
        ['stderr', 'err-done\n'],
      ]);
      stop();
    });

    it('does not corrupt multi-byte characters split across frames', async () => {
      const stop = h.start();
      const s = await h.attached();
      const euro = Buffer.from('price: €5\n', 'utf8'); // € is 3 bytes
      const cut = euro.indexOf(0xe2) + 1; // split inside the character

      s.write(Buffer.concat([frame(1, euro.subarray(0, cut)), frame(1, euro.subarray(cut))]));
      await tick();

      expect(h.texts()).toEqual(['price: €5\n']);
      stop();
    });

    it('treats CRLF as a line break and skips blank lines', async () => {
      const stop = h.start();
      const s = await h.attached();
      s.write(frame(1, 'a\r\n\r\n\nb\r\n'));
      await tick();
      expect(h.texts()).toEqual(['a\n', 'b\n']);
      stop();
    });

    it('copes with a first chunk that holds only part of the first header', async () => {
      const stop = h.start();
      const s = await h.attached();
      const whole = frame(2, 'boom\n');

      s.write(whole.subarray(0, 2));
      await tick();
      s.write(whole.subarray(2));
      await tick();

      expect(h.lines.map((l) => [l.stream, l.data])).toEqual([['stderr', 'boom\n']]);
      stop();
    });

    it('does not lose the first frame when its payload is larger than the first chunk', async () => {
      const stop = h.start();
      const s = await h.attached();
      const big = frame(1, 'x'.repeat(5000) + '\n');

      s.write(big.subarray(0, 100)); // first chunk ends mid-frame
      await tick();
      s.write(big.subarray(100));
      await tick();

      expect(h.texts()).toEqual(['x'.repeat(5000) + '\n']);
      stop();
    });
  });

  describe('raw (TTY) streams', () => {
    it('shows a very short first chunk immediately instead of waiting for header bytes', async () => {
      const stop = h.start();
      const s = await h.attached();
      s.write('ok\n');
      await tick();
      expect(h.texts()).toEqual(['ok\n']);
      stop();
    });

    it('emits plain text lines as stdout', async () => {
      const stop = h.start();
      const s = await h.attached();

      s.write('boot ok\nlistening on :80\n');
      await tick();

      expect(h.lines.map((l) => [l.stream, l.data])).toEqual([
        ['stdout', 'boot ok\n'],
        ['stdout', 'listening on :80\n'],
      ]);
      stop();
    });

    it('joins lines split across chunks', async () => {
      const stop = h.start();
      const s = await h.attached();
      s.write('hel');
      await tick();
      s.write('lo\n');
      await tick();
      expect(h.texts()).toEqual(['hello\n']);
      stop();
    });
  });

  describe('timestamps', () => {
    it('uses an ISO timestamp at the start of the line when present', async () => {
      const stop = h.start();
      const s = await h.attached();
      s.write(frame(1, '[2024-03-05T10:20:30.123Z] started\n'));
      await tick();
      expect(h.lines[0]!.timestamp).toBe(Date.parse('2024-03-05T10:20:30.123Z'));
      stop();
    });

    it('falls back to the arrival time otherwise', async () => {
      const before = Date.now();
      const stop = h.start();
      const s = await h.attached();
      s.write(frame(1, 'no timestamp here\n'));
      await tick();
      const ts = h.lines[0]!.timestamp;
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(Date.now());
      stop();
    });
  });

  describe('options and lifecycle', () => {
    it('asks Docker for a following stream of both outputs with the requested tail/since', async () => {
      const stop = h.start({ tail: 25, since: 99 });
      await h.attached();
      expect(h.logs).toHaveBeenCalledWith({ follow: true, stdout: true, stderr: true, tail: 25, since: 99 });
      stop();
    });

    it('defaults to the last 100 lines', async () => {
      const stop = h.start();
      await h.attached();
      expect(h.logs.mock.calls[0]![0]).toMatchObject({ tail: 100, since: 0 });
      stop();
    });

    it('flushes an unterminated last line when the stream ends', async () => {
      const stop = h.start();
      const s = await h.attached();
      s.write(frame(1, 'complete\nno newline at the end'));
      await tick();
      expect(h.texts()).toEqual(['complete\n']);

      s.end();
      await vi.waitFor(() => expect(h.texts()).toEqual(['complete\n', 'no newline at the end\n']));
      stop();
    });

    it('flushes pending text and destroys the stream on cancel', async () => {
      const stop = h.start();
      const s = await h.attached();
      s.write(frame(1, 'pending'));
      await tick();

      stop();

      expect(h.texts()).toEqual(['pending\n']);
      expect(s.destroyed).toBe(true);
    });

    it('stops emitting after cancel', async () => {
      const stop = h.start();
      const s = await h.attached();
      stop();
      s.write(frame(1, 'late\n'));
      await tick();
      expect(h.texts()).toEqual([]);
    });

    it('destroys a stream that resolves only after the subscription was cancelled', async () => {
      let resolveLogs!: (s: PassThrough) => void;
      const late = new PassThrough();
      const logs = vi.fn(() => new Promise<PassThrough>((r) => (resolveLogs = r)));
      const docker = { getContainer: () => ({ logs }) } as unknown as Dockerode;
      const stop = new DockerLogStreamer(docker).stream('c1', {}, () => undefined);

      stop();
      resolveLogs(late);
      await vi.waitFor(() => expect(late.destroyed).toBe(true));
    });

    it('is safe to cancel twice', async () => {
      const stop = h.start();
      await h.attached();
      stop();
      expect(() => stop()).not.toThrow();
    });
  });

  describe('reconnection', () => {
    beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));
    afterEach(() => vi.useRealTimers());

    it('reattaches after the stream ends, resuming with a short tail instead of replaying history', async () => {
      const stop = h.start({ tail: 500 });
      const first = await h.attached();
      first.end();
      await vi.advanceTimersByTimeAsync(1000);

      const second = await h.attached(2);
      expect(second).not.toBe(first);
      const resumed = h.logs.mock.calls[1]![0] as { tail: number; since: number };
      expect(resumed.tail).toBe(50);
      expect(resumed.since).toBeGreaterThan(0);
      stop();
    });

    it('backs off exponentially, capped at 5 seconds', async () => {
      h.logs.mockRejectedValue(new Error('container is not running'));
      const stop = h.start();

      await vi.advanceTimersByTimeAsync(0);
      expect(h.logs).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(999);
      expect(h.logs).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1); // 1s
      expect(h.logs).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(2000); // +2s
      expect(h.logs).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(4000); // +4s
      expect(h.logs).toHaveBeenCalledTimes(4);
      await vi.advanceTimersByTimeAsync(5000); // capped at 5s from here on
      expect(h.logs).toHaveBeenCalledTimes(5);
      await vi.advanceTimersByTimeAsync(5000);
      expect(h.logs).toHaveBeenCalledTimes(6);
      stop();
    });

    it('gives up after 20 attempts so a deleted container does not spin forever', async () => {
      h.logs.mockRejectedValue(new Error('no such container'));
      const stop = h.start();

      await vi.advanceTimersByTimeAsync(10 * 60_000);
      const total = h.logs.mock.calls.length;
      expect(total).toBe(21); // initial try + 20 retries
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(h.logs).toHaveBeenCalledTimes(total);
      stop();
    });

    it('does not reconnect after cancel', async () => {
      h.logs.mockRejectedValue(new Error('down'));
      const stop = h.start();
      await vi.advanceTimersByTimeAsync(0);
      stop();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(h.logs).toHaveBeenCalledTimes(1);
    });

    it('survives a synchronous throw from the Docker client', async () => {
      const throwing = vi.fn(() => {
        throw new Error('bad socket');
      });
      const docker = { getContainer: () => ({ logs: throwing }) } as unknown as Dockerode;
      const stop = new DockerLogStreamer(docker).stream('c1', {}, () => undefined);
      await vi.advanceTimersByTimeAsync(1000);
      expect(throwing).toHaveBeenCalledTimes(2);
      stop();
    });
  });
});
