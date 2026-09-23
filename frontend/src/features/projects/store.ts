import { create } from 'zustand';
import { getSocket } from '@/shared/lib/ws';
import {
  type Project,
  type DeploymentStatus,
  type DeployEvent,
  type EnvVar,
} from '@/shared/lib/schemas';
import { projectsApi } from './api';

interface LogLine {
  stream: 'stdout' | 'stderr';
  line: string;
  ts: number;
}

interface DeployState {
  deploymentId: string;
  projectId: string;
  status: DeploymentStatus;
  logs: LogLine[];
  exitCode: number | null;
  error: string | undefined;
}

interface ProjectsState {
  items: Project[];
  loading: boolean;
  error: string | null;
  lastStatusByProject: Record<string, DeploymentStatus | undefined>;
  deploys: Record<string, DeployState>;
  activeDeployId: string | null;
  composeCache: Record<string, { relPath: string; content: string } | undefined>;
  composeLoading: Record<string, boolean>;
  fetch: () => Promise<void>;
  add: (cloneUrl: string, envVars: EnvVar[]) => Promise<Project>;
  createAdHoc: (
    name: string,
    composeContent: string,
    envVars: EnvVar[],
  ) => Promise<Project>;
  updateEnv: (id: string, envVars: EnvVar[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  triggerDeploy: (projectId: string) => Promise<string>;
  openDeploy: (deploymentId: string) => void;
  subscribeDeploy: (deploymentId: string, projectId: string) => () => void;
  closeDeploy: (deploymentId: string) => void;
  loadCompose: (id: string, relPath?: string) => Promise<{ relPath: string; content: string }>;
  saveCompose: (
    id: string,
    content: string,
    relPath?: string,
  ) => Promise<{ exitCode: number; error?: string }>;
}

function emptyDeployState(deploymentId: string, projectId: string): DeployState {
  return {
    deploymentId,
    projectId,
    status: 'queued',
    logs: [],
    exitCode: null,
    error: undefined,
  };
}

export const useProjects = create<ProjectsState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  lastStatusByProject: {},
  deploys: {},
  activeDeployId: null,
  composeCache: {},
  composeLoading: {},

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const items = await projectsApi.list();
      set({ items, loading: false });
      const map: Record<string, DeploymentStatus | undefined> = {};
      await Promise.all(
        items.map(async (p) => {
          try {
            const ds = await projectsApi.deployments(p.id);
            map[p.id] = ds[0]?.status;
          } catch {
            map[p.id] = undefined;
          }
        }),
      );
      set({ lastStatusByProject: map });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load projects',
        loading: false,
      });
    }
  },

  add: async (cloneUrl: string, envVars: EnvVar[]) => {
    const project = await projectsApi.clone(cloneUrl, envVars);
    set((s) => ({ items: [project, ...s.items] }));
    return project;
  },

  createAdHoc: async (name, composeContent, envVars) => {
    const project = await projectsApi.createAdHoc({ name, composeContent, envVars });
    set((s) => ({ items: [project, ...s.items] }));
    return project;
  },

  updateEnv: async (id: string, envVars: EnvVar[]) => {
    await projectsApi.updateEnv(id, envVars);
    set((s) => ({
      items: s.items.map((p) => (p.id === id ? { ...p, envVars } : p)),
    }));
  },

  remove: async (id: string) => {
    await projectsApi.remove(id);
    set((s) => {
      const next = { ...s.lastStatusByProject };
      delete next[id];
      return { items: s.items.filter((p) => p.id !== id), lastStatusByProject: next };
    });
  },

  triggerDeploy: async (projectId: string) => {
    const deploymentId = await projectsApi.deploy(projectId);
    set((s) => ({
      deploys: {
        ...s.deploys,
        [deploymentId]: emptyDeployState(deploymentId, projectId),
      },
      activeDeployId: deploymentId,
    }));
    return deploymentId;
  },

  openDeploy: (deploymentId) => {
    set({ activeDeployId: deploymentId });
  },

  subscribeDeploy: (deploymentId, projectId) => {
    const socket = getSocket();
    const event = `deploy:${deploymentId}`;
    const handler = (raw: unknown): void => {
      const ev = raw as DeployEvent;
      set((s) => {
        const current = s.deploys[deploymentId];
        if (!current) return {};
        const next: DeployState = { ...current };
        if (ev.kind === 'log') {
          const logs = [...current.logs, { ...ev, ts: Date.now() }];
          next.logs = logs.length > 5000 ? logs.slice(logs.length - 5000) : logs;
        } else if (ev.kind === 'status') {
          next.status = ev.status;
        } else if (ev.kind === 'exit') {
          next.exitCode = ev.exitCode;
          next.error = ev.error;
        }
        const deploys = { ...s.deploys, [deploymentId]: next };
        const lastStatusByProject =
          ev.kind === 'exit' || ev.kind === 'status'
            ? { ...s.lastStatusByProject, [projectId]: next.status }
            : s.lastStatusByProject;
        return { deploys, lastStatusByProject };
      });
    };
    socket.off(event);
    socket.emit('subscribe', { channel: 'deploy', id: deploymentId });
    socket.on(event, handler);
    return () => {
      socket.emit('unsubscribe', { channel: 'deploy', id: deploymentId });
      socket.off(event, handler);
    };
  },

  closeDeploy: (deploymentId) => {
    set((s) => {
      const next = { ...s.deploys };
      delete next[deploymentId];
      const activeDeployId = s.activeDeployId === deploymentId ? null : s.activeDeployId;
      return { deploys: next, activeDeployId };
    });
  },

  // Fetches the compose file unless we already have the same relPath cached.
  loadCompose: async (id, relPath) => {
    const cached = get().composeCache[id];
    if (cached && (relPath === undefined || cached.relPath === relPath)) {
      return cached;
    }
    set((s) => ({ composeLoading: { ...s.composeLoading, [id]: true } }));
    try {
      const compose = await projectsApi.getCompose(id, relPath);
      set((s) => ({
        composeCache: { ...s.composeCache, [id]: compose },
        composeLoading: { ...s.composeLoading, [id]: false },
      }));
      return compose;
    } catch (err) {
      set((s) => ({
        composeLoading: { ...s.composeLoading, [id]: false },
      }));
      throw err;
    }
  },

  // Saves the compose file (backend recreates containers on success)
  // and refreshes the cache to the persisted version.
  saveCompose: async (id, content, relPath) => {
    const result = await projectsApi.updateCompose(id, content, relPath);
    if (result.exitCode === 0) {
      const cached = get().composeCache[id];
      const finalRel = relPath ?? cached?.relPath ?? '';
      set((s) => ({
        composeCache: {
          ...s.composeCache,
          [id]: { relPath: finalRel, content },
        },
      }));
    }
    return result;
  },
}));
