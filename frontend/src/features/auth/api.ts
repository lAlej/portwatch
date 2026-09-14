import { z } from 'zod';
import { api } from '@/shared/lib/api';
import { UserSchema, type User } from '@/shared/lib/schemas';

export const LoginResponseSchema = z.object({ user: UserSchema });

export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ user: User }>('/api/auth/login', { username, password }, LoginResponseSchema),
  logout: () => api.post<{ ok: true }>('/api/auth/logout'),
  me: () => api.get<{ user: User }>('/api/auth/me', LoginResponseSchema),
};
