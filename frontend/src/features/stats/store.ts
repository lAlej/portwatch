import { create } from 'zustand';
import type { SystemStats } from '@/shared/lib/schemas';
import { getSocket } from '@/shared/lib/ws';

interface SystemState {
  latest: SystemStats | null;
  history: SystemStats[];
  historyMax: number;
  start: () => () => void;
}

export const useSystemStats = create<SystemState>((set, get) => ({
  latest: null,
  history: [],
  historyMax: 60,

  start: () => {
    const socket = getSocket();
    const onStats = (s: SystemStats) => {
      const { history, historyMax } = get();
      const next = [...history, s];
      if (next.length > historyMax) next.shift();
      set({ latest: s, history: next });
    };
    socket.on('system:stats', onStats);
    socket.emit('subscribe', { channel: 'system:stats' });
    return () => {
      socket.emit('unsubscribe', { channel: 'system:stats' });
      socket.off('system:stats', onStats);
    };
  },
}));
