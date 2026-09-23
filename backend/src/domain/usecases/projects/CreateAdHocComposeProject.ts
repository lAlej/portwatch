import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ProjectsRepository } from '../../ports/ProjectsRepository.js';
import type { Logger } from '../../ports/Logger.js';
import type { Project, EnvVar } from '../../entities/Project.js';
import { InvalidStateError } from '../../../lib/errors.js';
import { sanitizeProjectName } from '../../../lib/projectName.js';

// Creates a project without cloning a repo: just writes docker-compose.yml
// (+ optional .env) under ${PROJECTS_DIR}/<name>/ and registers the Project
// with cloneUrl = ''. The resulting container gets the
// com.docker.compose.project label automatically, so GetProjectForContainer
// resolves it and the UI shows "Edit compose".
export class CreateAdHocComposeProject {
  constructor(
    private readonly deps: {
      repo: ProjectsRepository;
      logger: Logger;
      projectsDir: string;
    },
  ) {}

  async execute(input: {
    name: string;
    composeContent: string;
    envVars?: EnvVar[];
  }): Promise<{ project: Project }> {
    const rawName = input.name.trim();
    if (!rawName) throw new InvalidStateError('name is required');

    const compose = input.composeContent;
    if (!compose.trim()) throw new InvalidStateError('composeContent is required');

    const name = sanitizeProjectName(rawName);
    if (await this.deps.repo.getByName(name)) {
      throw new InvalidStateError(`Project "${name}" already exists`);
    }

    const dest = join(this.deps.projectsDir, name);

    this.deps.logger.info('creating ad-hoc compose project', { name, dest });

    await fs.mkdir(dest, { recursive: true });
    const composePath = join(dest, 'docker-compose.yml');
    const tmpCompose = `${composePath}.tmp`;
    try {
      await fs.writeFile(tmpCompose, compose, 'utf8');
      await fs.rename(tmpCompose, composePath);
    } catch (err) {
      await fs.rm(dest, { recursive: true, force: true });
      const msg = err instanceof Error ? err.message : 'write compose failed';
      throw new InvalidStateError(`write docker-compose.yml failed: ${msg}`);
    }

    const envVars = (input.envVars ?? []).filter((v) => v.key.trim().length > 0);
    if (envVars.length > 0) {
      try {
        await this.writeEnvFile(dest, envVars);
      } catch (err) {
        await fs.rm(dest, { recursive: true, force: true });
        const msg = err instanceof Error ? err.message : 'write .env failed';
        throw new InvalidStateError(`write .env failed: ${msg}`);
      }
    }

    const project: Project = {
      id: randomUUID(),
      name,
      cloneUrl: '',
      path: dest,
      composeFile: 'docker-compose.yml',
      hasDockerfile: false,
      createdAt: Date.now(),
      envVars,
    };

    await this.deps.repo.upsert(project);
    this.deps.logger.info('ad-hoc project registered', { id: project.id, name });
    return { project };
  }

  // Mirrors HostGit.writeEnvFile locally to keep this use case free of the
  // git adapter (ad-hoc projects have nothing to do with git).
  private async writeEnvFile(dir: string, vars: EnvVar[]): Promise<void> {
    const lines = vars
      .filter((v) => v.key.trim().length > 0 && typeof v.value === 'string')
      .map((v) => {
        const key = v.key.trim();
        const value = v.value;
        if (value === '') return `${key}=`;
        if (/[\s"'$`\\#]/.test(value)) {
          const escaped = value.replace(/(?=["\\])/g, '\\').replace(/\n/g, '\\n');
          return `${key}="${escaped}"`;
        }
        return `${key}=${value}`;
      });
    const envPath = join(dir, '.env');
    const tmp = `${envPath}.tmp`;
    await fs.writeFile(tmp, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
    await fs.rename(tmp, envPath);
  }
}