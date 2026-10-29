import { vi } from 'vitest';

type Handler = (...args: unknown[]) => void;

/** Minimal stand-in for a socket.io client: records emits, lets tests fire server events. */
export class FakeSocket {
  connected = true;
  readonly emitted: Array<{ event: string; payload: unknown }> = [];
  private handlers = new Map<string, Set<Handler>>();

  emit = vi.fn((event: string, payload?: unknown) => {
    this.emitted.push({ event, payload });
    return this;
  });

  on = vi.fn((event: string, handler: Handler) => {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler);
    return this;
  });

  off = vi.fn((event: string, handler?: Handler) => {
    if (!handler) this.handlers.delete(event);
    else this.handlers.get(event)?.delete(handler);
    return this;
  });

  disconnect = vi.fn(() => {
    this.connected = false;
    return this;
  });

  /** Simulates the server pushing `event`. */
  receive(event: string, ...args: unknown[]): void {
    for (const h of [...(this.handlers.get(event) ?? [])]) h(...args);
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}
