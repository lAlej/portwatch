// In-memory doubles for the domain ports. Shared by the use-case and adapter
// tests; never imported by production code (excluded from the build).
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import type { ComposeFile } from '../domain/entities/ComposeFile.js';
import type { Deployment } from '../domain/entities/Deployment.js';
import type { Project } from '../domain/entities/Project.js';
import type { DeployPublisher } from '../domain/ports/DeployPublisher.js';
import type { DeployEvent, DeployRunner } from '../domain/ports/DeployRunner.js';
import type { DeploymentsRepository } from '../domain/ports/DeploymentsRepository.js';
import type { DockerComposeRunner } from '../domain/ports/DockerComposeRunner.js';
import type { Git } from '../domain/ports/Git.js';
import type { Logger } from '../domain/ports/Logger.js';
import type { ProjectsRepository } from '../domain/ports/ProjectsRepository.js';
import { NotFoundError } from '../lib/errors.js';

export function fakeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'my-app',
    cloneUrl: 'https://example.com/me/my-app.git',
    path: '/projects/my-app',
    composeFile: 'docker-compose.yml',
    hasDockerfile: false,
    createdAt: 1_700_000_000_000,
    envVars: [],
    ...overrides,
  };
}

export class InMemoryProjectsRepository implements ProjectsRepository {
  readonly projects = new Map<string, Project>();
  readonly composeFiles = new Map<string, string>();

  constructor(initial: Project[] = []) {
    for (const p of initial) this.projects.set(p.id, p);
  }

  async list(): Promise<Project[]> {
    return [...this.projects.values()];
  }
  async get(id: string): Promise<Project | null> {
    return this.projects.get(id) ?? null;
  }
  async getByName(name: string): Promise<Project | null> {
    return [...this.projects.values()].find((p) => p.name === name) ?? null;
  }
  async upsert(p: Project): Promise<void> {
    this.projects.set(p.id, p);
  }
  async remove(id: string): Promise<void> {
    this.projects.delete(id);
  }
  async readComposeFile(project: Project, relPath?: string): Promise<ComposeFile> {
    const rel = relPath ?? project.composeFile;
    const content = this.composeFiles.get(`${project.id}:${rel}`);
    if (content === undefined) throw new NotFoundError(`Compose file "${rel}" not found`);
    return { relPath: rel, content };
  }
  async writeComposeFile(project: Project, content: string, relPath?: string): Promise<void> {
    this.composeFiles.set(`${project.id}:${relPath ?? project.composeFile}`, content);
  }
}

export class InMemoryDeploymentsRepository implements DeploymentsRepository {
  readonly items: Deployment[] = [];
  /** Every state a deployment went through, in order. */
  readonly history: Deployment[] = [];

  async append(d: Deployment): Promise<void> {
    this.items.push(d);
    this.history.push(d);
  }
  async update(d: Deployment): Promise<void> {
    const i = this.items.findIndex((x) => x.id === d.id);
    if (i >= 0) this.items[i] = d;
    else this.items.push(d);
    this.history.push(d);
  }
  async getByProject(projectId: string, limit = 20): Promise<Deployment[]> {
    return this.items.filter((d) => d.projectId === projectId).slice(0, limit);
  }
}

export class RecordingPublisher implements DeployPublisher {
  readonly events: Array<{ deploymentId: string; event: DeployEvent }> = [];
  containersChanged = 0;
  private waiters: Array<() => void> = [];

  publish(deploymentId: string, event: DeployEvent): void {
    this.events.push({ deploymentId, event });
    if (event.kind === 'exit') this.flush();
  }
  notifyContainersChanged(): void {
    this.containersChanged += 1;
    this.flush();
  }
  /** Resolves once a deploy has emitted its final `exit` and the container refresh signal. */
  finished(): Promise<void> {
    const done = this.events.some((e) => e.event.kind === 'exit') && this.containersChanged > 0;
    if (done) return Promise.resolve();
    return new Promise<void>((resolve) => this.waiters.push(resolve)).then(() => this.finished());
  }
  private flush(): void {
    const w = this.waiters;
    this.waiters = [];
    w.forEach((fn) => fn());
  }
}

/** DeployRunner that replays a fixed script of events (or throws part-way). */
export function scriptedRunner(events: DeployEvent[], throwAfter?: Error): DeployRunner {
  return {
    async *run() {
      for (const e of events) yield e;
      if (throwAfter) throw throwAfter;
    },
    cancel: vi.fn(async () => undefined),
  };
}

export function fakeGit(overrides: Partial<Git> = {}): Git {
  return {
    clone: vi.fn(async () => undefined),
    pull: vi.fn(() => lines([])),
    hasDockerfile: vi.fn(async () => false),
    findComposeFile: vi.fn(async () => 'docker-compose.yml'),
    removeDir: vi.fn(async () => undefined),
    writeEnvFile: vi.fn(async () => undefined),
    ...overrides,
  };
}

export function fakeCompose(overrides: Partial<DockerComposeRunner> = {}): DockerComposeRunner {
  return {
    build: vi.fn(() => lines([])),
    up: vi.fn(() => lines([])),
    upForceRecreate: vi.fn(() => lines([])),
    ...overrides,
  };
}

type Line = { line: string; stream: 'stdout' | 'stderr' };

/** Async iterable of lines that optionally throws once exhausted. */
export function lines(items: Line[], failWith?: Error): AsyncIterable<Line> {
  return (async function* () {
    for (const l of items) yield l;
    if (failWith) throw failWith;
  })();
}

export async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(join(tmpdir(), 'portwatch-test-'));
}

export async function removeDir(path: string): Promise<void> {
  await fs.rm(path, { recursive: true, force: true });
}
