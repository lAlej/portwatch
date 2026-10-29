import { beforeEach, describe, expect, it } from 'vitest';
import type { LogLine } from '@/shared/lib/schemas';
import { useLogs } from './store';

const line = (n: number): LogLine => ({ id: 'c1', stream: 'stdout', data: `line ${n}\n`, timestamp: n });

beforeEach(() => useLogs.setState({ lines: [], bufferMax: 2000 }));

describe('useLogs', () => {
  it('appends lines in arrival order', () => {
    useLogs.getState().push(line(1));
    useLogs.getState().push(line(2));
    expect(useLogs.getState().lines.map((l) => l.timestamp)).toEqual([1, 2]);
  });

  it('keeps only the newest lines once the buffer is full', () => {
    useLogs.setState({ bufferMax: 3 });
    for (let i = 1; i <= 5; i++) useLogs.getState().push(line(i));
    expect(useLogs.getState().lines.map((l) => l.timestamp)).toEqual([3, 4, 5]);
  });

  it('defaults to a 2000-line buffer', () => {
    for (let i = 0; i < 2100; i++) useLogs.getState().push(line(i));
    const { lines } = useLogs.getState();
    expect(lines).toHaveLength(2000);
    expect(lines[0]!.timestamp).toBe(100);
  });

  it('clear empties the buffer', () => {
    useLogs.getState().push(line(1));
    useLogs.getState().clear();
    expect(useLogs.getState().lines).toEqual([]);
  });

  it('never mutates a previously published array (React needs a new reference)', () => {
    useLogs.getState().push(line(1));
    const before = useLogs.getState().lines;
    useLogs.getState().push(line(2));
    expect(before).toHaveLength(1);
    expect(useLogs.getState().lines).not.toBe(before);
  });
});
