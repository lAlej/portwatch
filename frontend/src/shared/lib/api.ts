import type { z } from 'zod';

// Empty string = same-origin (frontend and API served by the same host).
// Set VITE_API_BASE at build time to point at a different origin, e.g.
// "http://your-vps-ip:4000" when the API is on a different port/host
// without a reverse proxy in front.
const BASE = (import.meta.env.VITE_API_BASE ?? '') as string;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public issues?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Validation failures arrive as `issues: [{ path, message }]` with no top-level
// message; show which field is wrong instead of a bare "Bad Request".
function describeIssues(issues: unknown): string | undefined {
  if (!Array.isArray(issues)) return undefined;
  const parts = issues.flatMap((i: unknown) => {
    if (!i || typeof i !== 'object') return [];
    const { path, message } = i as { path?: unknown; message?: unknown };
    if (typeof message !== 'string' || message === '') return [];
    return [typeof path === 'string' && path !== '' ? `${path}: ${message}` : message];
  });
  return parts.length > 0 ? parts.join('; ') : undefined;
}

async function request<T>(
  path: string,
  init: RequestInit & { schema?: z.ZodType<T> },
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });

  const text = await res.text();
  // The body is not necessarily ours: a reverse proxy answers 502/504 with an
  // HTML page while the backend restarts. Don't surface that as a JSON syntax error.
  let json: unknown = null;
  let malformed = false;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      malformed = true;
    }
  }

  if (!res.ok) {
    const e = (json ?? {}) as { error?: string; message?: string; issues?: unknown };
    throw new ApiError(
      res.status,
      e.error ?? 'error',
      e.message ?? describeIssues(e.issues) ?? res.statusText,
      e.issues,
    );
  }

  if (malformed) {
    throw new ApiError(res.status, 'invalid_response', 'Invalid response from server');
  }

  const schema = init.schema;
  if (schema) {
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(500, 'schema_error', 'Invalid response from server', parsed.error.issues);
    }
    return parsed.data;
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, schema?: z.ZodType<T>) => request<T>(path, { method: 'GET', schema }),
  post: <T>(path: string, body?: unknown, schema?: z.ZodType<T>) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined, schema }),
  put: <T>(path: string, body?: unknown, schema?: z.ZodType<T>) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined, schema }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
