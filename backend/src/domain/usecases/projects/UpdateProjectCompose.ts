import type { ProjectsRepository } from '../../ports/ProjectsRepository.js';
import type { DockerComposeRunner } from '../../ports/DockerComposeRunner.js';
import type { Logger } from '../../ports/Logger.js';
import type { DeployPublisher } from '../../ports/DeployPublisher.js';
import { NotFoundError } from '../../../lib/errors.js';
import { sanitizeProjectName } from '../../../lib/projectName.js';

export interface UpdateProjectComposeResult {
  exitCode: number;
  error?: string;
}

// Writes the compose file then runs `docker compose up -d --force-recreate`
// to apply config changes without rebuilding images.
// If the recreate fails, the file is already on disk; caller surfaces the error.
// Always notifies the publisher so the frontend re-fetches the container
// list — docker compose may have touched containers partially even on failure.
export class UpdateProjectCompose {
  constructor(
    private readonly deps: {
      repo: ProjectsRepository;
      compose: DockerComposeRunner;
      publisher: DeployPublisher;
      logger: Logger;
    },
  ) {}

  async execute(input: {
    id: string;
    content: string;
    relPath?: string;
  }): Promise<UpdateProjectComposeResult> {
    const project = await this.deps.repo.get(input.id);
    if (!project) throw new NotFoundError(`Project ${input.id} not found`);

    await this.deps.repo.writeComposeFile(project, input.content, input.relPath);
    this.deps.logger.info('compose file updated', {
      projectId: project.id,
      relPath: input.relPath ?? project.composeFile,
    });

    const projectName = sanitizeProjectName(project.name);
    let stderr = '';
    let exitCode = 0;
    try {
      for await (const line of this.deps.compose.upForceRecreate(
        project.path,
        project.composeFile,
        projectName,
      )) {
        if (line.stream === 'stderr') stderr += line.line + '\n';
      }
    } catch (err) {
      // spawnStream throws on non-zero exit with `message` = trimmed stderr;
      // no `code` field exposed.
      exitCode = 1;
      const msg = err instanceof Error ? err.message : '';
      if (!stderr.trim() && msg) stderr = msg + '\n';
    } finally {
      this.deps.publisher.notifyContainersChanged();
    }

    return exitCode === 0
      ? { exitCode }
      : { exitCode, error: stderr.trim() || 'docker compose up failed' };
  }
}