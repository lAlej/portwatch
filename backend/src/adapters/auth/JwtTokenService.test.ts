import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../../lib/errors.js';
import { JwtTokenService } from './JwtTokenService.js';

const SECRET = 'x'.repeat(48);
const admin = { username: 'admin', role: 'admin' } as const;

describe('JwtTokenService', () => {
  const svc = new JwtTokenService(SECRET);

  it('round-trips a signed token', () => {
    expect(svc.verify(svc.sign(admin, 60))).toEqual(admin);
  });

  it('rejects a token signed with another secret', () => {
    const forged = jwt.sign({ sub: 'admin', role: 'admin' }, 'y'.repeat(48));
    expect(() => svc.verify(forged)).toThrow(UnauthorizedError);
  });

  it('rejects unsigned (alg: none) tokens', () => {
    const unsigned = jwt.sign({ sub: 'admin', role: 'admin' }, '', { algorithm: 'none' });
    expect(() => svc.verify(unsigned)).toThrow(UnauthorizedError);
  });

  it('rejects other HMAC algorithms', () => {
    const hs512 = jwt.sign({ sub: 'admin', role: 'admin' }, SECRET, { algorithm: 'HS512' });
    expect(() => svc.verify(hs512)).toThrow(UnauthorizedError);
  });

  it('rejects expired tokens', () => {
    const expired = jwt.sign({ sub: 'admin', role: 'admin' }, SECRET, { expiresIn: -10 });
    expect(() => svc.verify(expired)).toThrow(UnauthorizedError);
  });

  it('rejects tokens with unexpected claims', () => {
    const odd = jwt.sign({ sub: 'admin', role: 'viewer' }, SECRET);
    expect(() => svc.verify(odd)).toThrow(UnauthorizedError);
  });
});
