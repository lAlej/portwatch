import type { ContainerRepository } from '../../ports/ContainerRepository.js';

export class InspectContainer {
  constructor(private readonly repo: ContainerRepository) {}
  execute(id: string): Promise<unknown> {
    return this.repo.inspect(id);
  }
}
