import type { User } from '../entities/User.js';

export interface AuthService {
  authenticate(username: string, password: string): Promise<User | null>;
}
