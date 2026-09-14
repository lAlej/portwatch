import type { AuthService } from '../../ports/AuthService.js';
import type { TokenService } from '../../ports/TokenService.js';
import type { Logger } from '../../ports/Logger.js';
import { UnauthorizedError } from '../../../lib/errors.js';

export interface LoginDeps {
  authService: AuthService;
  tokens: TokenService;
  logger: Logger;
}

export interface LoginResult {
  user: { username: string; role: 'admin' };
  token: string;
  ttlSeconds: number;
}

export class LoginUser {
  constructor(private readonly deps: LoginDeps) {}

  async execute(username: string, password: string, ttlSeconds: number): Promise<LoginResult> {
    const user = await this.deps.authService.authenticate(username, password);
    if (!user) {
      this.deps.logger.warn('login failed', { username });
      throw new UnauthorizedError('Invalid credentials');
    }
    const token = this.deps.tokens.sign(user, ttlSeconds);
    this.deps.logger.info('login ok', { username });
    return { user, token, ttlSeconds };
  }
}
