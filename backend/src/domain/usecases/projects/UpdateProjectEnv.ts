import type { ProjectsRepository } from '../../ports/ProjectsRepository.js';
import type { Git } from '../../ports/Git.js';
import type { EnvVar } from '../../entities/Project.js';
import { NotFoundError } from '../../../lib/errors.js';

export class UpdateProjectEnv {
  constructor(
    private readonly deps: { repo: ProjectsRepository; git: Git },
  ) {}

  async execute(input: { id: string; envVars: EnvVar[] }): Promise<void> {
    const project = await this.deps.repo.get(input.id);
    if (!project) throw new NotFoundError(`Project ${input.id} not found`);
    const envVars = input.envVars.filter((v) => v.key.trim().length > 0);
    await this.deps.git.writeEnvFile(project.path, envVars);
    await this.deps.repo.upsert({ ...project, envVars });
  }
}
