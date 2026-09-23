import type { Project } from '../entities/Project.js';
import type { ComposeFile } from '../entities/ComposeFile.js';

export interface ProjectsRepository {
  list(): Promise<Project[]>;
  get(id: string): Promise<Project | null>;
  getByName(name: string): Promise<Project | null>;
  upsert(p: Project): Promise<void>;
  remove(id: string): Promise<void>;
  readComposeFile(project: Project, relPath?: string): Promise<ComposeFile>;
  writeComposeFile(
    project: Project,
    content: string,
    relPath?: string,
  ): Promise<void>;
}
