import Dockerode, { type ContainerInfo } from 'dockerode';
import type { ContainerRepository } from '../../domain/ports/ContainerRepository.js';
import type {
  Container,
  ContainerPort,
  ContainerState,
} from '../../domain/entities/Container.js';
import { NotFoundError, InvalidStateError, DockerUnavailableError } from '../../lib/errors.js';

function mapState(raw: string): ContainerState {
  const allowed: ContainerState[] = [
    'running',
    'paused',
    'restarting',
    'exited',
    'created',
    'dead',
    'removing',
  ];
  const v = raw as ContainerState;
  return allowed.includes(v) ? v : 'unknown';
}

function mapPorts(ports: ContainerInfo['Ports']): ContainerPort[] {
  if (!ports) return [];
  return ports.map((p) => ({
    privatePort: p.PrivatePort,
    publicPort: p.PublicPort ?? null,
    type: p.Type,
    ip: p.IP ?? null,
  }));
}

export class DockerContainerRepository implements ContainerRepository {
  constructor(private readonly docker: Dockerode) {}

  private get(id: string): Dockerode.Container {
    return this.docker.getContainer(id);
  }

  async list(): Promise<Container[]> {
    let raw: ContainerInfo[];
    try {
      raw = await this.docker.listContainers({ all: true });
    } catch (err) {
      throw new DockerUnavailableError((err as Error).message);
    }
    const now = Date.now();
    return raw.map((c) => ({
      id: c.Id,
      name: (c.Names[0] ?? '/').replace(/^\//, ''),
      image: c.Image,
      state: mapState(c.State),
      status: c.Status,
      created: c.Created * 1000,
      ports: mapPorts(c.Ports),
      uptimeSeconds: c.State === 'running' ? Math.max(0, Math.floor((now - c.Created * 1000) / 1000)) : null,
      labels: c.Labels ?? {},
    }));
  }

  async start(id: string): Promise<void> {
    try {
      await this.get(id).start();
    } catch (err) {
      const e = err as { statusCode?: number; message: string };
      if (e.statusCode === 404) throw new NotFoundError(`Container ${id} not found`);
      if (e.statusCode === 304) return;
      throw e;
    }
  }

  async pause(id: string): Promise<void> {
    try {
      await this.get(id).pause();
    } catch (err) {
      const e = err as { statusCode?: number; message: string };
      if (e.statusCode === 404) throw new NotFoundError(`Container ${id} not found`);
      if (e.statusCode === 409) throw new InvalidStateError(`Cannot pause container ${id}`);
      throw e;
    }
  }

  async unpause(id: string): Promise<void> {
    try {
      await this.get(id).unpause();
    } catch (err) {
      const e = err as { statusCode?: number; message: string };
      if (e.statusCode === 404) throw new NotFoundError(`Container ${id} not found`);
      if (e.statusCode === 409) throw new InvalidStateError(`Cannot unpause container ${id}`);
      throw e;
    }
  }

  async restart(id: string): Promise<void> {
    try {
      await this.get(id).restart();
    } catch (err) {
      const e = err as { statusCode?: number; message: string };
      if (e.statusCode === 404) throw new NotFoundError(`Container ${id} not found`);
      throw e;
    }
  }

  async kill(id: string): Promise<void> {
    try {
      await this.get(id).kill();
    } catch (err) {
      const e = err as { statusCode?: number; message: string };
      if (e.statusCode === 404) throw new NotFoundError(`Container ${id} not found`);
      throw e;
    }
  }

  async inspect(id: string): Promise<unknown> {
    try {
      const data = await this.get(id).inspect();
      return data;
    } catch (err) {
      const e = err as { statusCode?: number };
      if (e.statusCode === 404) throw new NotFoundError(`Container ${id} not found`);
      throw err;
    }
  }
}
