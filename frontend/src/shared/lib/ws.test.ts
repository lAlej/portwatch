import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '@/test/fakeSocket';

const io = vi.hoisted(() => vi.fn());
vi.mock('socket.io-client', () => ({ io }));

import { useConnection } from './connection';
import { closeSocket, getSocket } from './ws';

beforeEach(() => {
  io.mockReset();
  io.mockImplementation(() => new FakeSocket());
  closeSocket(); // drop any socket left by a previous test
  io.mockClear();
  useConnection.setState({ connected: false });
});

describe('getSocket', () => {
  it('connects with credentials, preferring websockets with a polling fallback', () => {
    getSocket();
    expect(io).toHaveBeenCalledWith({ withCredentials: true, transports: ['websocket', 'polling'] });
  });

  it('shares a single socket across callers', () => {
    expect(getSocket()).toBe(getSocket());
    expect(io).toHaveBeenCalledTimes(1);
  });

  it('keeps the same socket while it reconnects instead of opening a second one', () => {
    const s = getSocket() as unknown as FakeSocket;
    s.connected = false;
    expect(getSocket()).toBe(s);
    expect(io).toHaveBeenCalledTimes(1);
  });

  it('mirrors the connection state into the connection store', () => {
    const s = getSocket() as unknown as FakeSocket;
    expect(useConnection.getState().connected).toBe(false);

    s.receive('connect');
    expect(useConnection.getState().connected).toBe(true);

    s.receive('disconnect');
    expect(useConnection.getState().connected).toBe(false);

    s.receive('connect');
    s.receive('connect_error', new Error('unauthorized'));
    expect(useConnection.getState().connected).toBe(false);
  });
});

describe('closeSocket', () => {
  it('disconnects, marks the app offline and lets the next call open a fresh socket', () => {
    const first = getSocket() as unknown as FakeSocket;
    first.receive('connect');

    closeSocket();

    expect(first.disconnect).toHaveBeenCalled();
    expect(useConnection.getState().connected).toBe(false);
    const second = getSocket();
    expect(second).not.toBe(first);
    expect(io).toHaveBeenCalledTimes(2);
  });

  it('is safe to call with no socket open', () => {
    closeSocket();
    expect(() => closeSocket()).not.toThrow();
  });
});
