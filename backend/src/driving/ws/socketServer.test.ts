import { io as connectClient, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeployEvent } from '../../domain/ports/DeployRunner.js';
import { startApp, testConfig, type TestApp } from '../../testing/app.js';
import type { AppConfig } from '../../lib/env.js';

let app: TestApp;
let cookie: string;
const open: Socket[] = [];

async function boot(overrides: Partial<AppConfig> = {}): Promise<void> {
  app = await startApp(overrides);
  cookie = await app.login();
}

/** Resolves with the connected socket, or rejects with the server's refusal reason. */
function connect(opts: { cookie?: string | null; origin?: string } = {}): Promise<Socket> {
  const headers: Record<string, string> = {};
  const c = opts.cookie === undefined ? cookie : opts.cookie;
  if (c) headers.cookie = c;
  if (opts.origin) headers.origin = opts.origin;
  const socket = connectClient(app.baseUrl, {
    transports: ['websocket'],
    extraHeaders: headers,
    reconnection: false,
    forceNew: true,
  });
  open.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => reject(err));
  });
}

const next = <T = unknown>(socket: Socket, event: string, ms = 1000): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), ms);
    socket.once(event, (data: T) => {
      clearTimeout(t);
      resolve(data);
    });
  });

const quiet = async (socket: Socket, event: string, ms = 150): Promise<boolean> => {
  let got = false;
  socket.once(event, () => (got = true));
  await new Promise((r) => setTimeout(r, ms));
  return !got;
};

afterEach(async () => {
  open.splice(0).forEach((s) => s.close());
  await app?.close();
});

describe('authentication', () => {
  beforeEach(() => boot());

  it('refuses a connection without the session cookie', async () => {
    await expect(connect({ cookie: null })).rejects.toThrow('unauthorized');
  });

  it('refuses an invalid token', async () => {
    await expect(connect({ cookie: 'token=garbage' })).rejects.toThrow('unauthorized');
  });

  it('accepts a valid session', async () => {
    const socket = await connect();
    expect(socket.connected).toBe(true);
  });
});

describe('origin checks (cross-site WebSocket hijacking)', () => {
  it('rejects a foreign Origin even with a valid session cookie', async () => {
    await boot();
    await expect(connect({ origin: 'https://evil.example' })).rejects.toThrow();
  });

  it('accepts the same origin as the Host header', async () => {
    await boot();
    const socket = await connect({ origin: app.baseUrl });
    expect(socket.connected).toBe(true);
  });

  it('accepts an allow-listed origin', async () => {
    await boot({ CORS_ORIGINS: ['http://localhost:5173'] });
    const socket = await connect({ origin: 'http://localhost:5173' });
    expect(socket.connected).toBe(true);
  });

  it('still rejects other origins when an allow-list is configured', async () => {
    await boot({ CORS_ORIGINS: ['http://localhost:5173'] });
    await expect(connect({ origin: 'http://localhost:5174' })).rejects.toThrow();
  });

  it('allows clients that send no Origin (non-browser)', async () => {
    await boot();
    expect((await connect()).connected).toBe(true);
  });
});

describe('subscribe validation', () => {
  beforeEach(() => boot());

  it.each([
    ['unknown channel', { channel: 'admin:shell' }],
    ['missing channel', {}],
    ['non-object payload', 'container:logs'],
    ['null payload', null],
    ['negative tail', { channel: 'container:logs', id: 'a', tail: -1 }],
    ['huge tail', { channel: 'container:logs', id: 'a', tail: 10_000_001 }],
    ['fractional tail', { channel: 'container:logs', id: 'a', tail: 1.5 }],
    ['string tail', { channel: 'container:logs', id: 'a', tail: '200' }],
    ['oversized id', { channel: 'container:logs', id: 'x'.repeat(129) }],
    ['empty id', { channel: 'container:stats', id: '' }],
  ])('replies with a subscribe_error for %s', async (_n, payload) => {
    const logs = vi.spyOn(app.wiring.ports.logStreamer, 'stream');
    const socket = await connect();
    const reply = next(socket, 'error');
    socket.emit('subscribe', payload);
    expect(await reply).toEqual({ code: 'subscribe_error', message: 'invalid subscribe payload' });
    expect(logs).not.toHaveBeenCalled();
  });

  it.each(['container:stats', 'container:logs', 'deploy'])('%s requires an id', async (channel) => {
    const socket = await connect();
    const reply = next<{ message: string }>(socket, 'error');
    socket.emit('subscribe', { channel });
    expect((await reply).message).toMatch(/requires id/);
  });

  it('ignores a malformed unsubscribe instead of crashing the connection', async () => {
    const socket = await connect();
    socket.emit('unsubscribe', 'nonsense');
    socket.emit('unsubscribe', null);
    await new Promise((r) => setTimeout(r, 100));
    expect(socket.connected).toBe(true);
  });
});

describe('streams', () => {
  beforeEach(() => boot());

  it('system:stats forwards samples and releases the subscription on unsubscribe', async () => {
    const unsubscribe = vi.fn();
    let push: (s: unknown) => void = () => undefined;
    app.wiring.useCases.subscribeSystem = {
      execute: vi.fn((cb: (s: unknown) => void) => {
        push = cb;
        return unsubscribe;
      }),
    } as never;
    const socket = await connect();

    socket.emit('subscribe', { channel: 'system:stats' });
    await vi.waitFor(() => expect(app.wiring.useCases.subscribeSystem.execute).toHaveBeenCalled());
    const sample = next(socket, 'system:stats');
    push({ cpu: 12 });
    expect(await sample).toEqual({ cpu: 12 });

    socket.emit('unsubscribe', { channel: 'system:stats' });
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
  });

  it('re-subscribing the same channel closes the previous stream (no duplicated lines)', async () => {
    const unsubscribe = vi.fn();
    const execute = vi.fn(() => unsubscribe);
    app.wiring.useCases.subscribeSystem = { execute } as never;
    const socket = await connect();

    socket.emit('subscribe', { channel: 'system:stats' });
    socket.emit('subscribe', { channel: 'system:stats' });
    socket.emit('subscribe', { channel: 'system:stats' });

    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(3));
    expect(unsubscribe).toHaveBeenCalledTimes(2); // all but the live one
  });

  it('releases every stream when the client disconnects', async () => {
    const unsubscribe = vi.fn();
    app.wiring.useCases.subscribeSystem = { execute: vi.fn(() => unsubscribe) } as never;
    const stop = vi.fn();
    app.wiring.ports.logStreamer.stream = vi.fn(() => stop);
    const socket = await connect();

    socket.emit('subscribe', { channel: 'system:stats' });
    socket.emit('subscribe', { channel: 'container:logs', id: 'c1' });
    await vi.waitFor(() => expect(app.wiring.ports.logStreamer.stream).toHaveBeenCalled());

    socket.close();
    await vi.waitFor(() => {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(stop).toHaveBeenCalledTimes(1);
    });
  });

  it('container:logs defaults to the last 200 lines and forwards lines on a per-container event', async () => {
    let emit: (l: unknown) => void = () => undefined;
    const stream = vi.fn((_id: string, _opts: unknown, cb: (l: unknown) => void) => {
      emit = cb;
      return () => undefined;
    });
    app.wiring.ports.logStreamer.stream = stream as never;
    const socket = await connect();

    socket.emit('subscribe', { channel: 'container:logs', id: 'c1' });
    await vi.waitFor(() => expect(stream).toHaveBeenCalled());
    expect(stream.mock.calls[0]![0]).toBe('c1');
    expect(stream.mock.calls[0]![1]).toEqual({ tail: 200, since: 0 });

    const line = next(socket, 'container:logs:c1');
    emit({ id: '1', stream: 'stdout', data: 'hello', timestamp: 1 });
    expect(await line).toMatchObject({ data: 'hello' });
  });

  it('container:logs honours an explicit tail and since', async () => {
    const stream = vi.fn(() => () => undefined);
    app.wiring.ports.logStreamer.stream = stream as never;
    const socket = await connect();
    socket.emit('subscribe', { channel: 'container:logs', id: 'c1', tail: 50, since: 123 });
    await vi.waitFor(() => expect(stream).toHaveBeenCalled());
    expect((stream.mock.calls[0] as unknown[])[1]).toEqual({ tail: 50, since: 123 });
  });

  it('container:stats forwards samples on a per-container event', async () => {
    let push: (s: unknown) => void = () => undefined;
    app.wiring.useCases.subscribeContainer = {
      execute: vi.fn((_id: string, cb: (s: unknown) => void) => {
        push = cb;
        return () => undefined;
      }),
    } as never;
    const socket = await connect();
    socket.emit('subscribe', { channel: 'container:stats', id: 'c9' });
    await vi.waitFor(() => expect(app.wiring.useCases.subscribeContainer.execute).toHaveBeenCalled());
    const sample = next(socket, 'container:stats:c9');
    push({ cpuPercent: 3 });
    expect(await sample).toEqual({ cpuPercent: 3 });
  });
});

describe('deploy channel and broadcasts', () => {
  beforeEach(() => boot());

  it('delivers deploy events only to sockets subscribed to that deployment', async () => {
    const a = await connect();
    const b = await connect();
    a.emit('subscribe', { channel: 'deploy', id: 'dep-1' });
    b.emit('subscribe', { channel: 'deploy', id: 'dep-2' });
    await new Promise((r) => setTimeout(r, 100));

    const event: DeployEvent = { kind: 'log', line: 'building...', stream: 'stdout' };
    const received = next(a, 'deploy:dep-1');
    const bStaysQuiet = quiet(b, 'deploy:dep-1');
    app.wiring.ports.deployPublisher.publish('dep-1', event);

    expect(await received).toEqual(event);
    expect(await bStaysQuiet).toBe(true);
  });

  it('stops delivering after unsubscribe', async () => {
    const socket = await connect();
    socket.emit('subscribe', { channel: 'deploy', id: 'dep-1' });
    await new Promise((r) => setTimeout(r, 100));
    socket.emit('unsubscribe', { channel: 'deploy', id: 'dep-1' });
    await new Promise((r) => setTimeout(r, 100));

    const quietAfter = quiet(socket, 'deploy:dep-1');
    app.wiring.ports.deployPublisher.publish('dep-1', { kind: 'exit', exitCode: 0 });
    expect(await quietAfter).toBe(true);
  });

  it('notifyContainersChanged reaches every connected client', async () => {
    const a = await connect();
    const b = await connect();
    const both = Promise.all([next(a, 'containers:changed'), next(b, 'containers:changed')]);
    app.wiring.ports.deployPublisher.notifyContainersChanged();
    await expect(both).resolves.toBeDefined();
  });
});

describe('config', () => {
  it('uses the same cookie secret for HTTP and socket sessions', async () => {
    await boot();
    const token = cookie.replace('token=', '');
    expect(app.wiring.ports.tokens.verify(token)).toEqual({ username: 'admin', role: 'admin' });
    expect(testConfig().JWT_SECRET.length).toBeGreaterThanOrEqual(32);
  });
});
