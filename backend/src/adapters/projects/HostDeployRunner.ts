import type { Project } from '../../domain/entities/Project.js';
import type { Deployment } from '../../domain/entities/Deployment.js';
import type { DeployRunner, DeployEvent } from '../../domain/ports/DeployRunner.js';
import type { Git } from '../../domain/ports/Git.js';
import type { DockerComposeRunner } from '../../domain/ports/DockerComposeRunner.js';
import type { Logger } from '../../domain/ports/Logger.js';

export class HostDeployRunner implements DeployRunner {
  constructor(
    private readonly deps: {
      git: Git;
      compose: DockerComposeRunner;
      logger: Logger;
    },
  ) {}

  async *run(project: Project, deployment: Deployment): AsyncIterable<DeployEvent> {
    const projectName = sanitizeProjectName(project.name);
    const composeFile = project.composeFile;

    // Step 1: git pull.
    yield { kind: 'status', status: 'pulling' };
    try {
      for await (const line of this.deps.git.pull(project.path)) {
        yield { kind: 'log', line: line.line, stream: line.stream };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'git pull failed';
      this.deps.logger.warn('git pull failed (continuing)', { project: project.name, error: msg });
      yield { kind: 'log', line: `warn: ${msg}`, stream: 'stderr' };
    }

    // Step 2: docker compose build --pull.
    if (composeFile) {
      yield { kind: 'status', status: 'building' };
      let buildCode = 0;
      try {
        for await (const line of this.deps.compose.build(project.path, composeFile, projectName)) {
          yield { kind: 'log', line: line.line, stream: line.stream };
        }
      } catch (err) {
        buildCode = 1;
        const msg = err instanceof Error ? err.message : 'compose build failed';
        yield { kind: 'log', line: `error: ${msg}`, stream: 'stderr' };
        yield { kind: 'exit', exitCode: buildCode, error: msg };
        return;
      }
      if (buildCode !== 0) {
        yield { kind: 'exit', exitCode: buildCode, error: 'compose build failed' };
        return;
      }

      // Step 3: docker compose up -d.
      yield { kind: 'status', status: 'starting' };
      try {
        for await (const line of this.deps.compose.up(project.path, composeFile, projectName)) {
          yield { kind: 'log', line: line.line, stream: line.stream };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'compose up failed';
        yield { kind: 'log', line: `error: ${msg}`, stream: 'stderr' };
        yield { kind: 'exit', exitCode: 1, error: msg };
        return;
      }
    } else {
      this.deps.logger.info('no compose file; skipping build/up', { project: project.name });
      yield { kind: 'log', line: 'No compose file; nothing to build/up.', stream: 'stdout' };
    }

    yield { kind: 'exit', exitCode: 0 };
  }

  async cancel(_deploymentId: string): Promise<void> {
    // v1: cancel is a no-op. The process runs to completion or failure.
  }
}

function sanitizeProjectName(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'project';
}
