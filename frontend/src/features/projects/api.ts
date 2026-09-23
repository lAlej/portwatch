import { z } from 'zod';
import { api } from '@/shared/lib/api';
import {
  EnvVarSchema,
  ProjectSchema,
  DeploymentSchema,
  type Project,
  type Deployment,
  type EnvVar,
} from '@/shared/lib/schemas';

const ProjectListSchema = z.object({ projects: z.array(ProjectSchema) });
const ProjectEnvelopeSchema = z.object({ project: ProjectSchema });
const DeploymentsEnvelopeSchema = z.object({ deployments: z.array(DeploymentSchema) });
const DeployIdSchema = z.object({ deploymentId: z.string() });
const EnvVarsSchema = z.array(EnvVarSchema);

const ComposeFileSchema = z.object({
  relPath: z.string(),
  content: z.string(),
});
const ComposeEnvelopeSchema = z.object({ compose: ComposeFileSchema });
const UpdateComposeResultSchema = z.object({
  exitCode: z.number(),
  error: z.string().optional(),
});

export const projectsApi = {
  list: (): Promise<Project[]> =>
    api
      .get<{ projects: Project[] }>('/api/projects', ProjectListSchema)
      .then((r) => r.projects),

  clone: (cloneUrl: string, envVars: EnvVar[]): Promise<Project> =>
    api
      .post<{ project: Project }>(
        '/api/projects',
        { cloneUrl, envVars },
        ProjectEnvelopeSchema,
      )
      .then((r) => r.project),

  updateEnv: (id: string, envVars: EnvVar[]): Promise<{ ok: true }> =>
    api.put<{ ok: true }>(`/api/projects/${id}/env`, { envVars }),

  remove: (id: string): Promise<{ ok: true }> =>
    api.del<{ ok: true }>(`/api/projects/${id}`),

  deployments: (projectId: string): Promise<Deployment[]> =>
    api
      .get<{ deployments: Deployment[] }>(
        `/api/projects/${projectId}/deployments`,
        DeploymentsEnvelopeSchema,
      )
      .then((r) => r.deployments),

  deploy: (projectId: string): Promise<string> =>
    api
      .post<{ deploymentId: string }>(
        `/api/projects/${projectId}/deploy`,
        undefined,
        DeployIdSchema,
      )
      .then((r) => r.deploymentId),

  // GET /api/projects/:id/compose -> { compose: { relPath, content } }
  getCompose: (
    id: string,
    relPath?: string,
  ): Promise<{ relPath: string; content: string }> =>
    api
      .get<{ compose: { relPath: string; content: string } }>(
        relPath
          ? `/api/projects/${id}/compose?relPath=${encodeURIComponent(relPath)}`
          : `/api/projects/${id}/compose`,
        ComposeEnvelopeSchema,
      )
      .then((r) => r.compose),

  // PUT /api/projects/:id/compose -> { exitCode, error? }
  updateCompose: (
    id: string,
    content: string,
    relPath?: string,
  ): Promise<{ exitCode: number; error?: string }> =>
    api.put(`/api/projects/${id}/compose`, { content, relPath }, UpdateComposeResultSchema),

  // POST /api/projects/ad-hoc -> { project }
  createAdHoc: (input: {
    name: string;
    composeContent: string;
    envVars: EnvVar[];
  }): Promise<Project> =>
    api
      .post<{ project: Project }>(
        '/api/projects/ad-hoc',
        input,
        ProjectEnvelopeSchema,
      )
      .then((r) => r.project),
};

// Re-export so callers can construct EnvVar literals with type-checking.
export type { EnvVar };
// Re-export the schema so the store / types align.
export { EnvVarsSchema };
