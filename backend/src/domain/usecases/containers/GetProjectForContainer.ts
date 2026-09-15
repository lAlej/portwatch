import type { ContainerRepository } from '../../ports/ContainerRepository.js';
import type { ProjectsRepository } from '../../ports/ProjectsRepository.js';
import { NotFoundError } from '../../../lib/errors.js';
import { sanitizeProjectName } from '../../../lib/projectName.js';

const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project';

export class GetProjectForContainer {
  constructor(
    private readonly deps: {
      containers: ContainerRepository;
      projects: ProjectsRepository;
    },
  ) {}

  async execute(input: { id: string }): Promise<{ projectId: string } | { projectId: null }> {
    const raw = await this.deps.containers.inspect(input.id).catch((err: unknown) => {
      if (err instanceof NotFoundError) return null;
      throw err;
    });
    if (raw === null) return { projectId: null };

    const labels = (raw as { Config?: { Labels?: Record<string, string> | null } })?.Config?.Labels;
    const composeProject = labels?.[COMPOSE_PROJECT_LABEL];
    if (!composeProject) return { projectId: null };

    const all = await this.deps.projects.list();
    const match = all.find((p) => sanitizeProjectName(p.name) === composeProject);
    return match ? { projectId: match.id } : { projectId: null };
  }
}
