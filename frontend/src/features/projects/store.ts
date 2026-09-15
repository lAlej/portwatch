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
  fetch: () => Promise<void>;
  add: (cloneUrl: string, envVars: EnvVar[]) => Promise<Project>;
  updateEnv: (id: string, envVars: EnvVar[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  triggerDeploy: (projectId: string) => Promise<string>;
  subscribeDeploy: (deploymentId: string, projectId: string) => () => void;
  closeDeploy: (deploymentId: string) => void;
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

export const useProjects = create<ProjectsState>((set) => ({
  items: [],
  loading: false,
  error: null,
  lastStatusByProject: {},
  deploys: {},

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
    }));
    return deploymentId;
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
      return { deploys: next };
    });
  },
}));
