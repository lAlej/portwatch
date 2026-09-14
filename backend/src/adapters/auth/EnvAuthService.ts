import type { AppConfig } from '../../lib/env.js';
import type { AuthService } from '../../domain/ports/AuthService.js';
import type { PasswordHasher } from '../../domain/ports/PasswordHasher.js';
import type { User } from '../../domain/entities/User.js';

export class EnvAuthService implements AuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly hasher: PasswordHasher,
  ) {}

  async authenticate(username: string, password: string): Promise<User | null> {
    if (username !== this.config.ADMIN_USERNAME) return null;
    const ok = await this.hasher.verify(password, this.config.ADMIN_PASSWORD_HASH);
    if (!ok) return null;
    return { username, role: 'admin' };
  }
}
