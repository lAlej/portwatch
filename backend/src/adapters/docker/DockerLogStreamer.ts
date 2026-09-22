import Dockerode from 'dockerode';
import { StringDecoder } from 'node:string_decoder';
import type { LogLine, LogStreamer } from '../../domain/ports/LogStreamer.js';

interface Frame {
  stream: 'stdout' | 'stderr';
  data: Buffer;
}

const FRAME_HEADER = 8;
const MAX_FRAME_SIZE = 16 * 1024 * 1024;
const LINE_TS_RE = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)\]/;

function parseLineTimestamp(line: string, fallback: number): number {
  const m = LINE_TS_RE.exec(line);
  if (!m || m[1] === undefined) return fallback;
  const ms = Date.parse(m[1]);
  return Number.isFinite(ms) ? ms : fallback;
}

export class DockerLogStreamer implements LogStreamer {
  constructor(private readonly docker: Dockerode) {}

  stream(
    id: string,
    opts: { tail?: number; since?: number },
    onLine: (line: LogLine) => void,
  ): () => void {
    let cancelled = false;
    let currentStream: NodeJS.ReadableStream | null = null;
    let currentStreamPromise: Promise<NodeJS.ReadableStream> | null = null;
    let reconnectAttempts = 0;
    let reconnectTimer: NodeJS.Timeout | null = null;

    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    let stdoutTail = '';
    let stderrTail = '';

    let headerCarry: Buffer = Buffer.alloc(0);
    let pendingFrame: { stream: 'stdout' | 'stderr'; remaining: number; chunks: Buffer[] } | null = null;
    let detectedMuxed = false;

    const flushDecoderTail = (stream: 'stdout' | 'stderr') => {
      const decoder = stream === 'stdout' ? stdoutDecoder : stderrDecoder;
      const text = decoder.end();
      const tail = (stream === 'stdout' ? stdoutTail : stderrTail) + text;
      if (tail.length > 0) {
        const now = Date.now();
        onLine({ id, stream, data: tail + '\n', timestamp: parseLineTimestamp(tail, now) });
      }
      if (stream === 'stdout') stdoutTail = '';
      else stderrTail = '';
    };

    const handleFrame = (frame: Frame) => {
      const decoder = frame.stream === 'stdout' ? stdoutDecoder : stderrDecoder;
      const text = decoder.write(frame.data);
      const combined = (frame.stream === 'stdout' ? stdoutTail : stderrTail) + text;
      const lines = combined.split(/\r?\n/);
      const tail = lines.pop() ?? '';
      if (frame.stream === 'stdout') stdoutTail = tail;
      else stderrTail = tail;

      const now = Date.now();
      for (const line of lines) {
        if (line.length === 0) continue;
        onLine({ id, stream: frame.stream, data: line + '\n', timestamp: parseLineTimestamp(line, now) });
      }
    };

    const parseFrames = (input: Buffer): Frame[] => {
      const out: Frame[] = [];
      let buf: Buffer = input;
      if (headerCarry.length > 0) {
        buf = Buffer.concat([headerCarry, input]);
        headerCarry = Buffer.alloc(0);
      }
      let offset = 0;
      while (buf.length - offset > 0) {
        if (pendingFrame) {
          const take = Math.min(pendingFrame.remaining, buf.length - offset);
          pendingFrame.chunks.push(Buffer.from(buf.subarray(offset, offset + take)));
          offset += take;
          pendingFrame.remaining -= take;
          if (pendingFrame.remaining === 0) {
            out.push({ stream: pendingFrame.stream, data: Buffer.concat(pendingFrame.chunks) });
            pendingFrame = null;
          }
          continue;
        }
        if (buf.length - offset < FRAME_HEADER) {
          headerCarry = Buffer.from(buf.subarray(offset));
          break;
        }
        const header = Buffer.from(buf.subarray(offset, offset + FRAME_HEADER));
        offset += FRAME_HEADER;
        const size = header.readUInt32BE(4);
        const streamType = header[0];
        const stream: 'stdout' | 'stderr' = streamType === 2 ? 'stderr' : 'stdout';
        if (size > MAX_FRAME_SIZE) {
          offset += size;
          continue;
        }
        if (buf.length - offset >= size) {
          out.push({ stream, data: Buffer.from(buf.subarray(offset, offset + size)) });
          offset += size;
        } else {
          const rest = Buffer.from(buf.subarray(offset));
          pendingFrame = { stream, remaining: size - rest.length, chunks: [rest] };
          offset = buf.length;
        }
      }
      return out;
    };

    const handleRaw = (input: Buffer) => {
      const text = stdoutDecoder.write(input);
      const combined = stdoutTail + text;
      const lines = combined.split(/\r?\n/);
      stdoutTail = lines.pop() ?? '';
      const now = Date.now();
      for (const line of lines) {
        if (line.length === 0) continue;
        onLine({ id, stream: 'stdout', data: line + '\n', timestamp: parseLineTimestamp(line, now) });
      }
    };

    const scheduleReconnect = (): void => {
      if (cancelled) return;
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
      const delay = Math.min(1000 * 2 ** reconnectAttempts, 5000);
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(() => {
        if (cancelled) return;
        startStream();
      }, delay);
    };

    const attach = (s: NodeJS.ReadableStream) => {
      currentStream = s;
      s.on('data', (chunk: Buffer | string) => {
        if (cancelled) return;
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        if (!detectedMuxed) {
          const looksMuxed =
            buf.length >= FRAME_HEADER &&
            buf[0] !== undefined &&
            buf[0] <= 2 &&
            buf.readUInt32BE(4) + FRAME_HEADER <= buf.length + (headerCarry.length > 0 ? headerCarry.length : 0);
          if (looksMuxed) {
            detectedMuxed = true;
          } else {
            handleRaw(buf);
            return;
          }
        }
        for (const frame of parseFrames(buf)) handleFrame(frame);
      });
      s.on('end', () => {
        flushDecoderTail('stdout');
        flushDecoderTail('stderr');
        // Stream ended (container exited). Reset state and try to
        // reattach so a subsequent restart keeps the log flowing.
        currentStream = null;
        currentStreamPromise = null;
        headerCarry = Buffer.alloc(0);
        pendingFrame = null;
        detectedMuxed = false;
        scheduleReconnect();
      });
      s.on('error', () => {
        currentStream = null;
        currentStreamPromise = null;
        scheduleReconnect();
      });
    };

    const startStream = (): void => {
      if (cancelled) return;
      let p: Promise<NodeJS.ReadableStream> | null = null;
      try {
        p = this.docker.getContainer(id).logs({
          follow: true,
          stdout: true,
          stderr: true,
          // On reconnect, take only the tail of the resumed container so we
          // don't re-emit thousands of lines from before the restart.
          tail: reconnectAttempts > 0 ? 50 : (opts.tail ?? 100),
          since: reconnectAttempts > 0 ? Math.floor(Date.now() / 1000) - 5 : (opts.since ?? 0),
        });
      } catch {
        scheduleReconnect();
        return;
      }
      currentStreamPromise = p;
      p.then(attach).catch(() => {
        // Container not found, daemon unreachable, etc. Retry with
        // backoff until the user closes the subscription.
        scheduleReconnect();
      });
    };

    startStream();

    return () => {
      cancelled = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      flushDecoderTail('stdout');
      flushDecoderTail('stderr');
      const s = currentStream;
      const p = currentStreamPromise;
      currentStream = null;
      currentStreamPromise = null;
      if (s) {
        try {
          const maybe = s as unknown as { destroy?: () => void; end?: () => void };
          if (typeof maybe.destroy === 'function') maybe.destroy();
          else if (typeof maybe.end === 'function') maybe.end();
        } catch {
          /* ignore */
        }
      }
      if (p) {
        p.then((stream) => {
          const maybe = stream as unknown as { destroy?: () => void; end?: () => void };
          try {
            if (typeof maybe.destroy === 'function') maybe.destroy();
            else if (typeof maybe.end === 'function') maybe.end();
          } catch {
            /* ignore */
          }
        }).catch(() => undefined);
      }
    };
  }
}

// Cap retries so a missing/deleted container doesn't keep us spinning
// forever. ~3min total (1+2+4+4+4+4+4+4 ≈ 27s with the cap at 5s) before
// the subscription goes silent.
const MAX_RECONNECT_ATTEMPTS = 20;
