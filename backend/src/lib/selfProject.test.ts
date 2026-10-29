import { describe, expect, it } from 'vitest';
import { InvalidStateError } from './errors.js';
import { assertNotSelfProject, isSelfProject } from './selfProject.js';

describe('selfProject', () => {
  it('flags only the dashboard compose project', () => {
    expect(isSelfProject('portwatch')).toBe(true);
    expect(isSelfProject('portwatch-api')).toBe(false);
  });

  it('refuses to operate on the dashboard itself', () => {
    expect(() => assertNotSelfProject('portwatch')).toThrow(InvalidStateError);
    expect(() => assertNotSelfProject('my-app')).not.toThrow();
  });
});
