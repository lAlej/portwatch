import { createHash, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../../lib/env.js';
import type { AuthService } from '../../domain/ports/AuthService.js';
import type { PasswordHasher } from '../../domain/ports/PasswordHasher.js';
import type { User } from '../../domain/entities/User.js';

// Hash both sides first so the comparison is constant-time regardless of length.
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export class EnvAuthService implements AuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly hasher: PasswordHasher,
  ) {}

  async authenticate(username: string, password: string): Promise<User | null> {
    // Always run the bcrypt comparison, even for an unknown username, so
    // response time doesn't reveal whether the username exists.
    const userOk = safeEqual(username, this.config.ADMIN_USERNAME);
    const passOk = await this.hasher.verify(password, this.config.ADMIN_PASSWORD_HASH);
    if (!userOk || !passOk) return null;
    return { username, role: 'admin' };
  }
}
