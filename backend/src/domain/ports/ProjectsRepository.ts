import type { Project } from '../entities/Project.js';

export interface ProjectsRepository {
  list(): Promise<Project[]>;
  get(id: string): Promise<Project | null>;
  getByName(name: string): Promise<Project | null>;
  upsert(p: Project): Promise<void>;
  remove(id: string): Promise<void>;
}
