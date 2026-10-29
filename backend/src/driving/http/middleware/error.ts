import type { Request, Response, NextFunction } from 'express';
import { DomainError } from '../../../lib/errors.js';

interface HttpError {
  status: number;
  code: string;
  message: string;
  issues?: unknown;
}

// Failures raised by body-parser (malformed JSON, oversized body, ...). They
// carry a 4xx `status` and a `type` but no `code`, so without this they were
// reported as 500s.
function bodyParserFailure(err: unknown): { status: number; error: string; message: string } | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { status?: unknown; type?: unknown };
  if (typeof e.status !== 'number' || e.status < 400 || e.status >= 500) return null;
  if (typeof e.type !== 'string') return null;
  if (e.type === 'entity.too.large') {
    return { status: 413, error: 'payload_too_large', message: 'Request body too large' };
  }
  if (e.type === 'entity.parse.failed') {
    return { status: 400, error: 'bad_request', message: 'Malformed request body' };
  }
  return { status: e.status, error: 'bad_request', message: 'Bad request' };
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof DomainError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  if (err && typeof err === 'object' && 'status' in err && 'code' in err) {
    const e = err as HttpError;
    res.status(e.status).json({ error: e.code, message: e.message, issues: e.issues });
    return;
  }
  const parsed = bodyParserFailure(err);
  if (parsed) {
    res.status(parsed.status).json({ error: parsed.error, message: parsed.message });
    return;
  }
  console.error('[unhandled]', err);
  // Raw error text can leak paths, hostnames or Docker internals; only show
  // it while developing.
  const message =
    process.env.NODE_ENV === 'development' && err instanceof Error
      ? err.message
      : 'Internal server error';
  res.status(500).json({ error: 'internal_error', message });
}
