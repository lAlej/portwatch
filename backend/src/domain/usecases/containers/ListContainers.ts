import type { ContainerRepository } from '../../ports/ContainerRepository.js';
import type { Container } from '../../entities/Container.js';

export class ListContainers {
  constructor(private readonly repo: ContainerRepository) {}

  async execute(): Promise<Container[]> {
    return this.repo.list();
  }
}
