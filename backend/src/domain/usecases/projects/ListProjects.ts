import type { ProjectsRepository } from '../../ports/ProjectsRepository.js';
import type { Project } from '../../entities/Project.js';

export class ListProjects {
  constructor(private readonly repo: ProjectsRepository) {}

  async execute(): Promise<{ projects: Project[] }> {
    const all = await this.repo.list();
    return { projects: all.sort((a, b) => b.createdAt - a.createdAt) };
  }
}
