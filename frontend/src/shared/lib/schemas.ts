import { z } from 'zod';

export const ContainerStateSchema = z.enum([
  'running',
  'paused',
  'restarting',
  'exited',
  'created',
  'dead',
  'removing',
  'unknown',
]);
export type ContainerState = z.infer<typeof ContainerStateSchema>;

export const ContainerPortSchema = z.object({
  privatePort: z.number(),
  publicPort: z.number().nullable(),
  type: z.string(),
  ip: z.string().nullable(),
});

export const ContainerSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  state: ContainerStateSchema,
  status: z.string(),
  created: z.number(),
  ports: z.array(ContainerPortSchema),
  uptimeSeconds: z.number().nullable(),
  labels: z.record(z.string(), z.string()),
});
export type Container = z.infer<typeof ContainerSchema>;

export const SystemStatsSchema = z.object({
  hostname: z.string(),
  uptimeSeconds: z.number(),
  cpuPercent: z.number(),
  cpuCores: z.number(),
  loadAverage: z.tuple([z.number(), z.number(), z.number()]),
  memoryTotalBytes: z.number(),
  memoryUsedBytes: z.number(),
  memoryFreeBytes: z.number(),
  diskTotalBytes: z.number(),
  diskUsedBytes: z.number(),
  networkRxBytesPerSec: z.number(),
  networkTxBytesPerSec: z.number(),
  networkTotalBytes: z.number(),
  timestamp: z.number(),
});
export type SystemStats = z.infer<typeof SystemStatsSchema>;

export const ContainerStatsSchema = z.object({
  id: z.string(),
  cpuPercent: z.number(),
  memoryUsageBytes: z.number(),
  memoryLimitBytes: z.number(),
  memoryPercent: z.number(),
  networkRxBytes: z.number(),
  networkTxBytes: z.number(),
  blockReadBytes: z.number(),
  blockWriteBytes: z.number(),
  timestamp: z.number(),
});
export type ContainerStats = z.infer<typeof ContainerStatsSchema>;

export const LogLineSchema = z.object({
  id: z.string(),
  stream: z.enum(['stdout', 'stderr']),
  data: z.string(),
  timestamp: z.number(),
});
export type LogLine = z.infer<typeof LogLineSchema>;

export const UserSchema = z.object({
  username: z.string(),
  role: z.literal('admin'),
});
export type User = z.infer<typeof UserSchema>;
