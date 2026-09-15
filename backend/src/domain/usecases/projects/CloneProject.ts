import { randomUUID } from 'node:crypto';
import type { ProjectsRepository } from '../../ports/ProjectsRepository.js';
import type { Git } from '../../ports/Git.js';
import type { Logger } from '../../ports/Logger.js';
import type { Project, EnvVar } from '../../entities/Project.js';
import { InvalidStateError } from '../../../lib/errors.js';

function deriveName(cloneUrl: string): string {
  const trimmed = cloneUrl.trim().replace(/\.git$/, '');
  const last = trimmed.split('/').pop() ?? '';
  const sane = last.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!sane) throw new InvalidStateError(`Cannot derive project name from URL: ${cloneUrl}`);
  return sane;
}

export class CloneProject {
  constructor(
    private readonly deps: {
      repo: ProjectsRepository;
      git: Git;
      logger: Logger;
      projectsDir: string;
    },
  ) {}

  async execute(input: { cloneUrl: string; envVars?: EnvVar[] }): Promise<{ project: Project }> {
    const url = input.cloneUrl.trim();
    if (!url) throw new InvalidStateError('cloneUrl is required');

    const name = deriveName(url);
    const dest = `${this.deps.projectsDir}/${name}`;

    if (await this.deps.repo.getByName(name)) {
      throw new InvalidStateError(`Project "${name}" already exists`);
    }

    this.deps.logger.info('cloning project', { name, url });

    try {
      await this.deps.git.clone(url, dest);
    } catch (err) {
      await this.deps.git.removeDir(dest).catch(() => undefined);
      const msg = err instanceof Error ? err.message : 'git clone failed';
      throw new InvalidStateError(`git clone failed: ${msg}`);
    }

    const hasDockerfile = await this.deps.git.hasDockerfile(dest);
    const composeFile = await this.deps.git.findComposeFile(dest);
    if (!hasDockerfile && !composeFile) {
      await this.deps.git.removeDir(dest).catch(() => undefined);
      throw new InvalidStateError(
        'Repository has no Dockerfile or docker-compose file. Nothing to deploy.',
      );
    }

    const envVars = (input.envVars ?? []).filter((v) => v.key.trim().length > 0);
    if (envVars.length > 0) {
      try {
        await this.deps.git.writeEnvFile(dest, envVars);
      } catch (err) {
        await this.deps.git.removeDir(dest).catch(() => undefined);
        const msg = err instanceof Error ? err.message : 'write .env failed';
        throw new InvalidStateError(`write .env failed: ${msg}`);
      }
    }

    const project: Project = {
      id: randomUUID(),
      name,
      cloneUrl: url,
      path: dest,
      composeFile: composeFile ?? '',
      hasDockerfile,
      createdAt: Date.now(),
      envVars,
    };

    await this.deps.repo.upsert(project);
    this.deps.logger.info('project registered', { id: project.id, name });
    return { project };
  }
}
