import { describe, expect, it, vi } from 'vitest';
import type { ContainerStatsProvider, SystemStatsProvider } from '../../ports/StatsProvider.js';
import { GetSystemSnapshot } from './GetSystemSnapshot.js';
import { SubscribeContainerStats } from './SubscribeContainerStats.js';
import { SubscribeSystemStats } from './SubscribeSystemStats.js';

describe('stats use cases', () => {
  it('GetSystemSnapshot returns the provider snapshot', async () => {
    const snapshot = vi.fn(async () => ({ hostname: 'h' }) as never);
    const provider: SystemStatsProvider = { snapshot, subscribe: vi.fn() };
    await expect(new GetSystemSnapshot(provider).execute()).resolves.toEqual({ hostname: 'h' });
  });

  it('SubscribeSystemStats hands the listener to the provider and returns its unsubscribe', () => {
    const off = vi.fn();
    const subscribe = vi.fn(() => off);
    const provider: SystemStatsProvider = { snapshot: vi.fn(), subscribe };
    const listener = vi.fn();

    const unsubscribe = new SubscribeSystemStats(provider).execute(listener);

    expect(subscribe).toHaveBeenCalledWith(listener);
    expect(unsubscribe).toBe(off);
  });

  it('SubscribeContainerStats scopes the subscription to one container', () => {
    const off = vi.fn();
    const subscribe = vi.fn(() => off);
    const provider: ContainerStatsProvider = { subscribe };
    const listener = vi.fn();

    const unsubscribe = new SubscribeContainerStats(provider).execute('c42', listener);

    expect(subscribe).toHaveBeenCalledWith('c42', listener);
    expect(unsubscribe).toBe(off);
  });
});
