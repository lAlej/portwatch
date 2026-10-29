import jwt from 'jsonwebtoken';
import type { TokenService } from '../../domain/ports/TokenService.js';
import type { User } from '../../domain/entities/User.js';
import { UnauthorizedError } from '../../lib/errors.js';

interface JwtPayload {
  sub: string;
  role: 'admin';
}

const ALGORITHM = 'HS256' as const;

export class JwtTokenService implements TokenService {
  constructor(private readonly secret: string) {}

  sign(user: User, ttlSeconds: number): string {
    const payload: JwtPayload = { sub: user.username, role: user.role };
    return jwt.sign(payload, this.secret, { algorithm: ALGORITHM, expiresIn: ttlSeconds });
  }

  verify(token: string): User {
    try {
      // Pin the algorithm so a forged token can't pick its own (e.g. `none`).
      const decoded = jwt.verify(token, this.secret, { algorithms: [ALGORITHM] }) as Partial<JwtPayload>;
      if (typeof decoded.sub !== 'string' || decoded.role !== 'admin') {
        throw new Error('malformed claims');
      }
      return { username: decoded.sub, role: decoded.role };
    } catch {
      throw new UnauthorizedError('Invalid token');
    }
  }
}
