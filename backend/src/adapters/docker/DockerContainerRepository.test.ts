import type Dockerode from 'dockerode';
import { describe, expect, it, vi } from 'vitest';
import { DockerUnavailableError, InvalidStateError, NotFoundError } from '../../lib/errors.js';
import { DockerContainerRepository } from './DockerContainerRepository.js';

type Info = Dockerode.ContainerInfo;

function info(overrides: Partial<Info> = {}): Info {
  return {
    Id: 'abc123',
    Names: ['/web'],
    Image: 'nginx:alpine',
    ImageID: 'sha256:x',
    Command: 'nginx',
    Created: 1_700_000_000,
    Ports: [],
    Labels: {},
    State: 'running',
    Status: 'Up 2 hours',
    HostConfig: { NetworkMode: 'bridge' },
    NetworkSettings: { Networks: {} },
    Mounts: [],
    ...overrides,
  } as Info;
}

function build(opts: { list?: Info[] | Error; container?: Record<string, unknown> } = {}) {
  const listContainers =
    opts.list instanceof Error
      ? vi.fn(async () => Promise.reject(opts.list))
      : vi.fn(async () => opts.list ?? []);
  const container = {
    start: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    unpause: vi.fn(async () => undefined),
    restart: vi.fn(async () => undefined),
    kill: vi.fn(async () => undefined),
    inspect: vi.fn(async () => ({ Id: 'abc123' })),
    ...opts.container,
  };
  const getContainer = vi.fn(() => container);
  const repo = new DockerContainerRepository({ listContainers, getContainer } as unknown as Dockerode);
  return { repo, listContainers, getContainer, container };
}

const dockerError = (statusCode: number, message = 'docker said no') =>
  Object.assign(new Error(message), { statusCode });

describe('DockerContainerRepository.list', () => {
  it('asks Docker for all containers, running or not', async () => {
    const { repo, listContainers } = build();
    await repo.list();
    expect(listContainers).toHaveBeenCalledWith({ all: true });
  });

  it('maps a Docker container to the domain entity', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime((1_700_000_000 + 7200) * 1000); // two hours after creation
    try {
      const { repo } = build({
        list: [
          info({
            Ports: [
              { PrivatePort: 80, PublicPort: 8080, Type: 'tcp', IP: '0.0.0.0' },
              { PrivatePort: 443, Type: 'tcp' },
            ] as Info['Ports'],
            Labels: { app: 'web' },
          }),
        ],
      });

      const [c] = await repo.list();

      expect(c).toEqual({
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
        labels: { app: 'web' },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('only reports uptime for running containers', async () => {
    const { repo } = build({
      list: [
        info({ Id: 'r', State: 'running' }),
        info({ Id: 'e', State: 'exited' }),
        info({ Id: 'p', State: 'paused' }),
      ],
    });
    const byId = Object.fromEntries((await repo.list()).map((c) => [c.id, c.uptimeSeconds]));
    expect(byId.r).toEqual(expect.any(Number));
    expect(byId.e).toBeNull();
    expect(byId.p).toBeNull();
  });

  it('never reports a negative uptime when the clock is behind the creation time', async () => {
    const { repo } = build({ list: [info({ Created: Math.floor(Date.now() / 1000) + 3600 })] });
    expect((await repo.list())[0]!.uptimeSeconds).toBe(0);
  });

  it.each(['running', 'paused', 'restarting', 'exited', 'created', 'dead', 'removing'])(
    'keeps the known state %s',
    async (state) => {
      const { repo } = build({ list: [info({ State: state })] });
      expect((await repo.list())[0]!.state).toBe(state);
    },
  );

  it('maps unrecognised states to "unknown"', async () => {
    const { repo } = build({ list: [info({ State: 'something-new' })] });
    expect((await repo.list())[0]!.state).toBe('unknown');
  });

  it('uses the first name without its leading slash, tolerating no names', async () => {
    const { repo } = build({ list: [info({ Names: ['/a', '/b'] }), info({ Id: 'x', Names: [] })] });
    const [a, b] = await repo.list();
    expect(a!.name).toBe('a');
    expect(b!.name).toBe('');
  });

  it('tolerates missing ports and labels', async () => {
    const { repo } = build({ list: [info({ Ports: undefined as never, Labels: undefined as never })] });
    const [c] = await repo.list();
    expect(c!.ports).toEqual([]);
    expect(c!.labels).toEqual({});
  });

  describe('hiding the dashboard itself', () => {
    it("filters out containers of Portwatch's own compose project", async () => {
      const { repo } = build({
        list: [
          info({ Id: 'self-backend', Labels: { 'com.docker.compose.project': 'portwatch' } }),
          info({ Id: 'self-caddy', Labels: { 'com.docker.compose.project': 'portwatch' } }),
        ],
      });
      expect(await repo.list()).toEqual([]);
    });

    it('keeps other compose projects, lookalike names and containers without labels', async () => {
      const { repo } = build({
        list: [
          info({ Id: 'other', Labels: { 'com.docker.compose.project': 'my-app' } }),
          info({ Id: 'lookalike', Labels: { 'com.docker.compose.project': 'portwatch-demo' } }),
          info({ Id: 'standalone', Labels: {} }),
        ],
      });
      expect((await repo.list()).map((c) => c.id)).toEqual(['other', 'lookalike', 'standalone']);
    });
  });

  it('wraps any Docker failure as DockerUnavailableError with the original message', async () => {
    const { repo } = build({ list: new Error('connect ENOENT /var/run/docker.sock') });
    const error = await repo.list().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DockerUnavailableError);
    expect((error as Error).message).toBe('connect ENOENT /var/run/docker.sock');
  });
});

describe('DockerContainerRepository actions', () => {
  const simple = ['start', 'pause', 'unpause', 'restart', 'kill'] as const;

  it.each(simple)('%s calls Docker with the container id', async (action) => {
    const { repo, getContainer, container } = build();
    await repo[action]('abc123');
    expect(getContainer).toHaveBeenCalledWith('abc123');
    expect(container[action]).toHaveBeenCalledTimes(1);
  });

  it.each(simple)('%s maps a Docker 404 to NotFoundError', async (action) => {
    const { repo } = build({ container: { [action]: vi.fn(async () => Promise.reject(dockerError(404))) } });
    await expect(repo[action]('gone')).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each(['pause', 'unpause'] as const)('%s maps a Docker 409 to InvalidStateError', async (action) => {
    const { repo } = build({ container: { [action]: vi.fn(async () => Promise.reject(dockerError(409))) } });
    await expect(repo[action]('abc')).rejects.toBeInstanceOf(InvalidStateError);
  });

  it('start treats "already started" (304) as success', async () => {
    const { repo } = build({ container: { start: vi.fn(async () => Promise.reject(dockerError(304))) } });
    await expect(repo.start('abc')).resolves.toBeUndefined();
  });

  it.each(simple)('%s rethrows unexpected Docker errors untouched', async (action) => {
    const boom = dockerError(500, 'daemon exploded');
    const { repo } = build({ container: { [action]: vi.fn(async () => Promise.reject(boom)) } });
    await expect(repo[action]('abc')).rejects.toBe(boom);
  });
});

describe('DockerContainerRepository.inspect', () => {
  it('returns the raw inspect document', async () => {
    const { repo } = build({ container: { inspect: vi.fn(async () => ({ Id: 'abc', State: {} })) } });
    await expect(repo.inspect('abc')).resolves.toEqual({ Id: 'abc', State: {} });
  });

  it('maps 404 to NotFoundError and rethrows everything else', async () => {
    const missing = build({ container: { inspect: vi.fn(async () => Promise.reject(dockerError(404))) } });
    await expect(missing.repo.inspect('x')).rejects.toBeInstanceOf(NotFoundError);

    const boom = dockerError(500);
    const broken = build({ container: { inspect: vi.fn(async () => Promise.reject(boom)) } });
    await expect(broken.repo.inspect('x')).rejects.toBe(boom);
  });
});
