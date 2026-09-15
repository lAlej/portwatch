import type { ProjectsRepository } from '../../ports/ProjectsRepository.js';
import type { Git } from '../../ports/Git.js';
import type { Logger } from '../../ports/Logger.js';
import { NotFoundError } from '../../../lib/errors.js';

export class DeleteProject {
  constructor(
    private readonly deps: { repo: ProjectsRepository; git: Git; logger: Logger },
  ) {}

  async execute(input: { id: string }): Promise<void> {
    const project = await this.deps.repo.get(input.id);
    if (!project) throw new NotFoundError(`Project ${input.id} not found`);
    await this.deps.repo.remove(input.id);
    await this.deps.git.removeDir(project.path).catch((err) => {
      this.deps.logger.warn('failed to remove project directory', {
        path: project.path,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    this.deps.logger.info('project deleted', { id: input.id, name: project.name });
  }
}
