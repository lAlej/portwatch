import type { User } from '../entities/User.js';

export interface TokenService {
  sign(user: User, ttlSeconds: number): string;
  verify(token: string): User;
}
