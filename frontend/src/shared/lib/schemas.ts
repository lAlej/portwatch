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

export const DeploymentStatusSchema = z.enum([
  'queued',
  'pulling',
  'building',
  'starting',
  'success',
  'failed',
  'cancelled',
]);
export type DeploymentStatus = z.infer<typeof DeploymentStatusSchema>;

export const EnvVarSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});
export type EnvVar = z.infer<typeof EnvVarSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  cloneUrl: z.string(),
  path: z.string(),
  composeFile: z.string(),
  hasDockerfile: z.boolean(),
  createdAt: z.number(),
  envVars: z.array(EnvVarSchema),
});
export type Project = z.infer<typeof ProjectSchema>;

export const DeploymentSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  status: DeploymentStatusSchema,
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  exitCode: z.number().nullable(),
  error: z.string().optional(),
});
export type Deployment = z.infer<typeof DeploymentSchema>;

export const DeployEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('log'),
    line: z.string(),
    stream: z.enum(['stdout', 'stderr']),
  }),
  z.object({
    kind: z.literal('status'),
    status: DeploymentStatusSchema,
  }),
  z.object({
    kind: z.literal('exit'),
    exitCode: z.number(),
    error: z.string().optional(),
  }),
]);
export type DeployEvent = z.infer<typeof DeployEventSchema>;
