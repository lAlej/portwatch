import { create } from 'zustand';
import type { User } from '@/shared/lib/schemas';
import { authApi } from './api';

interface AuthState {
  user: User | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'error';
  error: string | null;
  bootstrap: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'idle',
  error: null,

  bootstrap: async () => {
    set({ status: 'loading', error: null });
    try {
      const { user } = await authApi.me();
      set({ user, status: 'authenticated' });
    } catch {
      set({ user: null, status: 'unauthenticated' });
    }
  },

  login: async (username, password) => {
    set({ status: 'loading', error: null });
    try {
      const { user } = await authApi.login(username, password);
      set({ user, status: 'authenticated', error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      set({ status: 'error', error: msg });
      throw err;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      /* ignore */
    }
    set({ user: null, status: 'unauthenticated' });
  },
}));
