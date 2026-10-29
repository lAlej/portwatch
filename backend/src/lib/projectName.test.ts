import { describe, expect, it } from 'vitest';
import { sanitizeProjectName } from './projectName.js';

describe('sanitizeProjectName', () => {
  it.each([
    ['My App', 'my-app'],
    ['already-ok_1', 'already-ok_1'],
    ['  padded  ', 'padded'],
    ['A!!B??C', 'a-b-c'],
    ['---edge---', 'edge'],
    ['Ünï cödé', 'n-c-d'],
  ])('%j -> %j', (input, expected) => {
    expect(sanitizeProjectName(input)).toBe(expected);
  });

  it('neutralises path traversal and separators', () => {
    expect(sanitizeProjectName('../../etc/passwd')).toBe('etc-passwd');
    expect(sanitizeProjectName('a\\b/c')).toBe('a-b-c');
  });

  it('never returns an empty name', () => {
    expect(sanitizeProjectName('')).toBe('project');
    expect(sanitizeProjectName('!!!')).toBe('project');
  });

  it('is idempotent', () => {
    for (const raw of ['My App', '../x', 'a b c', '___']) {
      const once = sanitizeProjectName(raw);
      expect(sanitizeProjectName(once)).toBe(once);
    }
  });

  it('only emits characters docker compose accepts for a project name', () => {
    expect(sanitizeProjectName('Weird $(name) `x` | y')).toMatch(/^[a-z0-9_-]+$/);
  });
});
