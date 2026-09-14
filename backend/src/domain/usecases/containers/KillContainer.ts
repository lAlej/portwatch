import type { ContainerRepository } from '../../ports/ContainerRepository.js';
import type { Logger } from '../../ports/Logger.js';

export class KillContainer {
  constructor(
    private readonly deps: { containerRepo: ContainerRepository; logger: Logger },
  ) {}
  async execute(id: string): Promise<void> {
    await this.deps.containerRepo.kill(id);
    this.deps.logger.info('container killed', { id });
  }
}
