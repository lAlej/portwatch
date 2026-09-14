export interface PasswordHasher {
  verify(plain: string, hash: string): Promise<boolean>;
  hash(plain: string): Promise<string>;
}
