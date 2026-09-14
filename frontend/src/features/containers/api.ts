import { z } from 'zod';
import { api } from '@/shared/lib/api';
import { ContainerSchema, type Container } from '@/shared/lib/schemas';

export const ContainersResponseSchema = z.object({ containers: z.array(ContainerSchema) });
export const InspectResponseSchema = z.object({ inspect: z.unknown() });

export const containersApi = {
  list: () => api.get('/api/containers', ContainersResponseSchema).then((r) => r.containers),
  start: (id: string) => api.post<{ ok: true; id: string }>(`/api/containers/${id}/start`),
  pause: (id: string) => api.post<{ ok: true; id: string }>(`/api/containers/${id}/pause`),
  unpause: (id: string) => api.post<{ ok: true; id: string }>(`/api/containers/${id}/unpause`),
  restart: (id: string) => api.post<{ ok: true; id: string }>(`/api/containers/${id}/restart`),
  kill: (id: string) => api.post<{ ok: true; id: string }>(`/api/containers/${id}/kill`),
  inspect: (id: string) =>
    api.get(`/api/containers/${id}/inspect`, InspectResponseSchema).then((r) => r.inspect as Record<string, unknown>),
};

export type { Container };
