import type { Request, Response, NextFunction } from 'express';
import { DomainError } from '../../../lib/errors.js';

interface HttpError {
  status: number;
  code: string;
  message: string;
  issues?: unknown;
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
  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'internal_error', message });
}
