import type { ProjectsRepository } from '../../ports/ProjectsRepository.js';
import type { ComposeFile } from '../../entities/ComposeFile.js';
import { NotFoundError } from '../../../lib/errors.js';

export class GetProjectCompose {
  constructor(private readonly deps: { repo: ProjectsRepository }) {}

  async execute(input: { id: string; relPath?: string }): Promise<ComposeFile> {
    const project = await this.deps.repo.get(input.id);
    if (!project) throw new NotFoundError(`Project ${input.id} not found`);
    return this.deps.repo.readComposeFile(project, input.relPath);
  }
}