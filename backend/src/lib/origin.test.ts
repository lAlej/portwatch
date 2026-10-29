import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from './origin.js';

describe('isAllowedOrigin', () => {
  it('lets through requests without an Origin header (non-browser clients)', () => {
    expect(isAllowedOrigin(undefined, 'dash.example.com', [])).toBe(true);
  });

  it('accepts the same origin as the Host header', () => {
    expect(isAllowedOrigin('https://dash.example.com', 'dash.example.com', [])).toBe(true);
    expect(isAllowedOrigin('http://1.2.3.4:8080', '1.2.3.4:8080', [])).toBe(true);
  });

  it('rejects a foreign origin', () => {
    expect(isAllowedOrigin('https://evil.example', 'dash.example.com', [])).toBe(false);
  });

  it('accepts a foreign origin only when allow-listed exactly', () => {
    const allowed = ['http://localhost:5173'];
    expect(isAllowedOrigin('http://localhost:5173', 'localhost:4000', allowed)).toBe(true);
    expect(isAllowedOrigin('http://localhost:5174', 'localhost:4000', allowed)).toBe(false);
  });

  it('rejects malformed origins and a missing Host', () => {
    expect(isAllowedOrigin('not a url', 'dash.example.com', [])).toBe(false);
    expect(isAllowedOrigin('https://dash.example.com', undefined, [])).toBe(false);
  });
});
