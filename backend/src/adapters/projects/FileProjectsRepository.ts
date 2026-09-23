// Persists each Project as JSON in ${PROJECTS_DIR}/.projects/<id>.json.
// `backfill` covers schema drift (missing `envVars` etc.) on read so old
// records keep working without a manual migration.
import { promises as fs } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { ProjectsRepository } from '../../domain/ports/ProjectsRepository.js';
import type { Project } from '../../domain/entities/Project.js';
import type { ComposeFile } from '../../domain/entities/ComposeFile.js';
import { NotFoundError } from '../../lib/errors.js';

function backfill(p: Project): Project {
  return {
    ...p,
    cloneUrl: typeof p.cloneUrl === 'string' ? p.cloneUrl : '',
    envVars: Array.isArray(p.envVars) ? p.envVars : [],
  };
}

// Rejects `..` traversal: the resolved path must stay inside project.path.
function resolveComposePath(project: Project, relPath?: string): {
  abs: string;
  rel: string;
} {
  const rel = relPath ?? project.composeFile;
  if (!rel) {
    throw new NotFoundError(
      `Project ${project.id} has no compose file configured`,
    );
  }
  const root = resolve(project.path);
  const abs = resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new NotFoundError(
      `Compose path "${rel}" escapes project directory`,
    );
  }
  return { abs, rel };
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

  async readComposeFile(
    project: Project,
    relPath?: string,
  ): Promise<ComposeFile> {
    const { abs, rel } = resolveComposePath(project, relPath);
    try {
      const content = await fs.readFile(abs, 'utf8');
      return { relPath: rel, content };
    } catch {
      throw new NotFoundError(`Compose file "${rel}" not found on disk`);
    }
  }

  async writeComposeFile(
    project: Project,
    content: string,
    relPath?: string,
  ): Promise<void> {
    const { abs } = resolveComposePath(project, relPath);
    const tmpPath = `${abs}.tmp`;
    await fs.writeFile(tmpPath, content, 'utf8');
    await fs.rename(tmpPath, abs);
  }
}