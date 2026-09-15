// Adapter FileProjectsRepository: persiste cada Project como un JSON en
// ${PROJECTS_DIR}/.projects/<id>.json. Writes atomicos via rename.
// Listar = leer el directorio y parsear.
//
// Backfill: si un JSON escrito por una version anterior del schema no
// tiene un campo esperado (ej. `envVars`, agregado despues), lo
// completamos con defaults al leer. Asi proyectos viejos siguen
// funcionando sin necesidad de migracion manual.
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { ProjectsRepository } from '../../domain/ports/ProjectsRepository.js';
import type { Project } from '../../domain/entities/Project.js';

function backfill(p: Project): Project {
  return {
    ...p,
    envVars: Array.isArray(p.envVars) ? p.envVars : [],
  };
}

export class FileProjectsRepository implements ProjectsRepository {
  constructor(private readonly projectsDir: string) {}

  private async dir(): Promise<string> {
    const d = join(this.projectsDir, '.projects');
    await fs.mkdir(d, { recursive: true });
    return d;
  }

  async list(): Promise<Project[]> {
    const d = await this.dir();
    const entries = await fs.readdir(d).catch(() => [] as string[]);
    const out: Project[] = [];
    for (const e of entries) {
      if (!e.endsWith('.json')) continue;
      try {
        const txt = await fs.readFile(join(d, e), 'utf8');
        out.push(backfill(JSON.parse(txt) as Project));
      } catch {
        /* skip corrupted */
      }
    }
    return out;
  }

  async get(id: string): Promise<Project | null> {
    const d = await this.dir();
    try {
      const txt = await fs.readFile(join(d, `${id}.json`), 'utf8');
      return backfill(JSON.parse(txt) as Project);
    } catch {
      return null;
    }
  }

  async getByName(name: string): Promise<Project | null> {
    const all = await this.list();
    return all.find((p) => p.name === name) ?? null;
  }

  async upsert(p: Project): Promise<void> {
    const d = await this.dir();
    const finalPath = join(d, `${p.id}.json`);
    const tmpPath = `${finalPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(p, null, 2), 'utf8');
    await fs.rename(tmpPath, finalPath);
  }

  async remove(id: string): Promise<void> {
    const d = await this.dir();
    await fs.rm(join(d, `${id}.json`), { force: true });
  }
}
