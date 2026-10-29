import { describe, expect, it } from 'vitest';
import {
  ContainerSchema,
  ContainerStatsSchema,
  DeployEventSchema,
  DeploymentSchema,
  EnvVarSchema,
  LogLineSchema,
  ProjectSchema,
  SystemStatsSchema,
  UserSchema,
} from './schemas';

// Fixtures mirror what the backend actually emits (see backend entities).
const container = {
  id: 'abc123',
  name: 'web',
  image: 'nginx:alpine',
  state: 'running',
  status: 'Up 2 hours',
  created: 1_700_000_000_000,
  ports: [
    { privatePort: 80, publicPort: 8080, type: 'tcp', ip: '0.0.0.0' },
    { privatePort: 443, publicPort: null, type: 'tcp', ip: null },
  ],
  uptimeSeconds: 7200,
  labels: { 'com.docker.compose.project': 'shop' },
};

const systemStats = {
  hostname: 'vps-1',
  uptimeSeconds: 86_400,
  cpuPercent: 12.5,
  cpuCores: 4,
  loadAverage: [0.5, 0.4, 0.3],
  memoryTotalBytes: 8e9,
  memoryUsedBytes: 3e9,
  memoryFreeBytes: 5e9,
  diskTotalBytes: 1e11,
  diskUsedBytes: 4e10,
  networkRxBytesPerSec: 1200,
  networkTxBytesPerSec: 800,
  networkTotalBytes: 5e9,
  timestamp: 1_700_000_000_000,
};

const project = {
  id: 'p1',
  name: 'shop',
  cloneUrl: '',
  path: '/projects/shop',
  composeFile: 'docker-compose.yml',
  hasDockerfile: false,
  createdAt: 1_700_000_000_000,
  envVars: [{ key: 'PORT', value: '8080' }],
};

describe('ContainerSchema', () => {
  it('accepts a backend container', () => {
    expect(ContainerSchema.parse(container)).toEqual(container);
  });

  it('accepts a stopped container (null uptime) and unknown state', () => {
    expect(ContainerSchema.safeParse({ ...container, state: 'exited', uptimeSeconds: null }).success).toBe(true);
    expect(ContainerSchema.safeParse({ ...container, state: 'unknown' }).success).toBe(true);
  });

  it.each(['running', 'paused', 'restarting', 'exited', 'created', 'dead', 'removing', 'unknown'])(
    'knows the %s state',
    (state) => {
      expect(ContainerSchema.safeParse({ ...container, state }).success).toBe(true);
    },
  );

  it('rejects a state the UI has no styling for', () => {
    expect(ContainerSchema.safeParse({ ...container, state: 'hibernating' }).success).toBe(false);
  });

  it('rejects missing or mistyped fields', () => {
    const { ports: _ports, ...withoutPorts } = container;
    expect(ContainerSchema.safeParse(withoutPorts).success).toBe(false);
    expect(ContainerSchema.safeParse({ ...container, created: '2024-01-01' }).success).toBe(false);
    expect(ContainerSchema.safeParse({ ...container, labels: { a: 1 } }).success).toBe(false);
  });
});

describe('SystemStatsSchema', () => {
  it('accepts a backend sample', () => {
    expect(SystemStatsSchema.safeParse(systemStats).success).toBe(true);
  });

  it('requires exactly three load-average values', () => {
    expect(SystemStatsSchema.safeParse({ ...systemStats, loadAverage: [1, 2] }).success).toBe(false);
    expect(SystemStatsSchema.safeParse({ ...systemStats, loadAverage: [1, 2, 3, 4] }).success).toBe(false);
  });
});

describe('ContainerStatsSchema / LogLineSchema', () => {
  it('accepts a container sample', () => {
    const sample = {
      id: 'abc',
      cpuPercent: 3.2,
      memoryUsageBytes: 1,
      memoryLimitBytes: 2,
      memoryPercent: 50,
      networkRxBytes: 0,
      networkTxBytes: 0,
      blockReadBytes: 0,
      blockWriteBytes: 0,
      timestamp: 1,
    };
    expect(ContainerStatsSchema.safeParse(sample).success).toBe(true);
    expect(ContainerStatsSchema.safeParse({ ...sample, cpuPercent: '3.2' }).success).toBe(false);
  });

  it('accepts stdout/stderr log lines only', () => {
    const line = { id: 'c1', stream: 'stdout', data: 'hello\n', timestamp: 1 };
    expect(LogLineSchema.safeParse(line).success).toBe(true);
    expect(LogLineSchema.safeParse({ ...line, stream: 'stderr' }).success).toBe(true);
    expect(LogLineSchema.safeParse({ ...line, stream: 'stdin' }).success).toBe(false);
  });
});

describe('UserSchema', () => {
  it('only knows the admin role', () => {
    expect(UserSchema.safeParse({ username: 'admin', role: 'admin' }).success).toBe(true);
    expect(UserSchema.safeParse({ username: 'bob', role: 'viewer' }).success).toBe(false);
  });
});

describe('EnvVarSchema', () => {
  it('requires a non-empty key but allows an empty value', () => {
    expect(EnvVarSchema.safeParse({ key: 'A', value: '' }).success).toBe(true);
    expect(EnvVarSchema.safeParse({ key: '', value: 'x' }).success).toBe(false);
  });
});

describe('ProjectSchema', () => {
  it('accepts cloned and ad-hoc projects', () => {
    expect(ProjectSchema.safeParse(project).success).toBe(true);
    expect(ProjectSchema.safeParse({ ...project, cloneUrl: 'https://github.com/me/shop.git' }).success).toBe(true);
  });

  it('rejects a project with a malformed env var', () => {
    expect(ProjectSchema.safeParse({ ...project, envVars: [{ key: '', value: 'x' }] }).success).toBe(false);
  });
});

describe('DeploymentSchema', () => {
  const base = { id: 'd1', projectId: 'p1', status: 'success', startedAt: 1, finishedAt: 2, exitCode: 0 };

  it('accepts queued, in-flight and finished deployments', () => {
    expect(DeploymentSchema.safeParse({ ...base, status: 'queued', finishedAt: null, exitCode: null }).success).toBe(true);
    expect(DeploymentSchema.safeParse(base).success).toBe(true);
    expect(DeploymentSchema.safeParse({ ...base, status: 'failed', exitCode: 1, error: 'boom' }).success).toBe(true);
  });

  it('rejects unknown statuses', () => {
    expect(DeploymentSchema.safeParse({ ...base, status: 'paused' }).success).toBe(false);
  });
});

describe('DeployEventSchema', () => {
  it('discriminates log, status and exit events', () => {
    expect(DeployEventSchema.parse({ kind: 'log', line: 'hi', stream: 'stderr' })).toMatchObject({ kind: 'log' });
    expect(DeployEventSchema.parse({ kind: 'status', status: 'building' })).toMatchObject({ kind: 'status' });
    expect(DeployEventSchema.parse({ kind: 'exit', exitCode: 1, error: 'x' })).toMatchObject({ kind: 'exit' });
    expect(DeployEventSchema.parse({ kind: 'exit', exitCode: 0 })).toEqual({ kind: 'exit', exitCode: 0 });
  });

  it('rejects unknown kinds and payloads that do not match their kind', () => {
    expect(DeployEventSchema.safeParse({ kind: 'progress', pct: 50 }).success).toBe(false);
    expect(DeployEventSchema.safeParse({ kind: 'log', line: 'x' }).success).toBe(false);
    expect(DeployEventSchema.safeParse({ kind: 'status', status: 'nope' }).success).toBe(false);
    expect(DeployEventSchema.safeParse({ kind: 'exit', exitCode: '0' }).success).toBe(false);
  });
});
