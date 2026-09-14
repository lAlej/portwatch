import type { Container } from '../entities/Container.js';

export interface ContainerRepository {
  list(): Promise<Container[]>;
  start(id: string): Promise<void>;
  pause(id: string): Promise<void>;
  unpause(id: string): Promise<void>;
  restart(id: string): Promise<void>;
  kill(id: string): Promise<void>;
  inspect(id: string): Promise<unknown>;
}
