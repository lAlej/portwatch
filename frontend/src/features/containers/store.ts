import { create } from 'zustand';
import type { Container } from '@/shared/lib/schemas';
import { containersApi } from './api';

interface ContainersState {
  items: Container[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  start: (id: string) => Promise<void>;
  pause: (id: string) => Promise<void>;
  unpause: (id: string) => Promise<void>;
  restart: (id: string) => Promise<void>;
  kill: (id: string) => Promise<void>;
  refreshOne: (id: string) => Promise<void>;
}

async function refreshAfter(act: () => Promise<unknown>): Promise<void> {
  await act();
  await new Promise((r) => setTimeout(r, 300));
  await useContainers.getState().fetch();
}

export const useContainers = create<ContainersState>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const items = await containersApi.list();
      set({ items, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load containers', loading: false });
    }
  },

  start: async (id) => {
    await refreshAfter(() => containersApi.start(id));
    void get();
  },
  pause: async (id) => {
    await refreshAfter(() => containersApi.pause(id));
    void get();
  },
  unpause: async (id) => {
    await refreshAfter(() => containersApi.unpause(id));
    void get();
  },
  restart: async (id) => {
    await refreshAfter(() => containersApi.restart(id));
    void get();
  },
  kill: async (id) => {
    await refreshAfter(() => containersApi.kill(id));
    void get();
  },

  refreshOne: async (id) => {
    const items = get().items;
    const idx = items.findIndex((c) => c.id === id);
    if (idx < 0) return;
    try {
      const info = await containersApi.inspect(id);
      const state = (info?.State as { Status?: string } | undefined)?.Status ?? 'unknown';
      const status = (info?.State as { Status?: string } | undefined)?.Status ?? '';
      const next = [...items];
      next[idx] = { ...next[idx]!, state: state as never, status };
      set({ items: next });
    } catch {
      /* ignore */
    }
  },
}));
