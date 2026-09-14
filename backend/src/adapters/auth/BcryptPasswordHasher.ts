import bcrypt from 'bcryptjs';
import type { PasswordHasher } from '../../domain/ports/PasswordHasher.js';

export class BcryptPasswordHasher implements PasswordHasher {
  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, 12);
  }
}
