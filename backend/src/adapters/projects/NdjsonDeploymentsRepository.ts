import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { DeploymentsRepository } from '../../domain/ports/DeploymentsRepository.js';
import type { Deployment } from '../../domain/entities/Deployment.js';

export class NdjsonDeploymentsRepository implements DeploymentsRepository {
  constructor(private readonly projectsDir: string) {}

  private get file(): string {
    return join(this.projectsDir, '.deployments.ndjson');
  }

  private async ensureFile(): Promise<void> {
    await fs.mkdir(this.projectsDir, { recursive: true });
    try {
      await fs.access(this.file);
    } catch {
      await fs.writeFile(this.file, '', 'utf8');
    }
  }

  async append(d: Deployment): Promise<void> {
    await this.ensureFile();
    await fs.appendFile(this.file, JSON.stringify(d) + '\n', 'utf8');
  }

  async update(d: Deployment): Promise<void> {
    await this.ensureFile();
    const all = await this.readAll();
    const idx = all.findIndex((x) => x.id === d.id);
    if (idx >= 0) all[idx] = d;
    else all.push(d);
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, all.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8');
    await fs.rename(tmp, this.file);
  }

  async getByProject(projectId: string, limit = 20): Promise<Deployment[]> {
    const all = await this.readAll();
    return all
      .filter((d) => d.projectId === projectId)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }

  private async readAll(): Promise<Deployment[]> {
    await this.ensureFile();
    const txt = await fs.readFile(this.file, 'utf8');
    const out: Deployment[] = [];
    for (const line of txt.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed) as Deployment);
      } catch {
        /* skip malformed */
      }
    }
    return out;
  }
}
