// Boots the real composition root (real use cases, real file-backed
// repositories on a temp dir) behind a real HTTP + Socket.IO server on an
// ephemeral port. Docker is never contacted unless a test calls it.
import bcrypt from 'bcryptjs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server as IoServer } from 'socket.io';
import { SocketIoDeployPublisher } from '../adapters/projects/SocketIoDeployPublisher.js';
import { buildApp, setDeployPublisher, type AppWiring } from '../composition/container.js';
import { buildHttpServer } from '../driving/http/server.js';
import { attachSocketServer } from '../driving/ws/socketServer.js';
import type { AppConfig } from '../lib/env.js';
import { makeTmpDir, removeDir } from './fakes.js';

export const ADMIN_USERNAME = 'admin';
export const ADMIN_PASSWORD = 'correct-horse-battery';
const JWT_SECRET = 'test-secret-'.padEnd(48, 'x');

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    PORT: 0,
    NODE_ENV: 'production', // avoids the pino-pretty worker thread
    LOG_LEVEL: 'fatal',
    ADMIN_USERNAME,
    ADMIN_PASSWORD_HASH: bcrypt.hashSync(ADMIN_PASSWORD, 4), // low cost: fast tests
    JWT_SECRET,
    JWT_TTL_SECONDS: 3600,
    COOKIE_SECURE: false,
    COOKIE_SAMESITE: 'strict',
    CORS_ORIGINS: [],
    TRUST_PROXY_HOPS: 0,
    LOGIN_RATE_LIMIT_MAX: 1000,
    LOGIN_RATE_LIMIT_WINDOW_MS: 60_000,
    DOCKER_SOCKET_PATH: '/nonexistent/docker.sock',
    STATS_INTERVAL_MS: 1000,
    LOG_BUFFER: 2000,
    PROJECTS_DIR: '',
    ...overrides,
  };
}

export interface ApiResponse {
  status: number;
  headers: Headers;
  json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface TestApp {
  baseUrl: string;
  wiring: AppWiring;
  io: IoServer;
  projectsDir: string;
  /** Logs in as the admin and returns the `token=...` cookie pair. */
  login(): Promise<string>;
  request(
    path: string,
    init?: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> },
  ): Promise<ApiResponse>;
  close(): Promise<void>;
}

export async function startApp(configOverrides: Partial<AppConfig> = {}): Promise<TestApp> {
  const projectsDir = await makeTmpDir();
  const wiring = buildApp(testConfig({ PROJECTS_DIR: projectsDir, ...configOverrides }));
  const server = http.createServer(buildHttpServer(wiring));
  const io = attachSocketServer(server, wiring);
  setDeployPublisher(wiring, new SocketIoDeployPublisher(io));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const request: TestApp['request'] = async (path, init = {}) => {
    const headers: Record<string, string> = { ...init.headers };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (init.cookie) headers.cookie = init.cookie;
    const res = await fetch(baseUrl + path, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, headers: res.headers, json };
  };

  return {
    baseUrl,
    wiring,
    io,
    projectsDir,
    request,
    async login() {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
      });
      if (res.status !== 200) throw new Error(`test login failed: ${res.status}`);
      const setCookie = res.headers.get('set-cookie') ?? '';
      return setCookie.split(';')[0]!;
    },
    async close() {
      await io.close();
      await removeDir(projectsDir);
    },
  };
}
