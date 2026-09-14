import { create } from 'zustand';
import type { LogLine } from '@/shared/lib/schemas';

interface LogsState {
  lines: LogLine[];
  bufferMax: number;
  push: (line: LogLine) => void;
  clear: () => void;
}

export const useLogs = create<LogsState>((set) => ({
  lines: [],
  bufferMax: 2000,
  push: (line) =>
    set((s) => {
      const next = [...s.lines, line];
      if (next.length > s.bufferMax) next.splice(0, next.length - s.bufferMax);
      return { lines: next };
    }),
  clear: () => set({ lines: [] }),
}));
