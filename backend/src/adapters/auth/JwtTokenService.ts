import jwt from 'jsonwebtoken';
import type { TokenService } from '../../domain/ports/TokenService.js';
import type { User } from '../../domain/entities/User.js';
import { UnauthorizedError } from '../../lib/errors.js';

interface JwtPayload {
  sub: string;
  role: 'admin';
}

export class JwtTokenService implements TokenService {
  constructor(private readonly secret: string) {}

  sign(user: User, ttlSeconds: number): string {
    const payload: JwtPayload = { sub: user.username, role: user.role };
    return jwt.sign(payload, this.secret, { expiresIn: ttlSeconds });
  }

  verify(token: string): User {
    try {
      const decoded = jwt.verify(token, this.secret) as JwtPayload;
      return { username: decoded.sub, role: decoded.role };
    } catch {
      throw new UnauthorizedError('Invalid token');
    }
  }
}
