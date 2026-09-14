import type { Request, Response, NextFunction } from 'express';
import type { AppWiring } from '../../../composition/container.js';
import { UnauthorizedError } from '../../../lib/errors.js';
import type { User } from '../../../domain/entities/User.js';

export interface AuthedRequest extends Request {
  user?: User;
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function requireAuth(wiring: AppWiring) {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    const token = req.cookies?.token as string | undefined;
    if (!token) return next(new UnauthorizedError('Missing auth cookie'));
    try {
      req.user = wiring.ports.tokens.verify(token);
      next();
    } catch (err) {
      next(err);
    }
  };
}
