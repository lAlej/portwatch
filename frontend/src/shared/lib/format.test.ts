import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatBytesPerSec,
  formatPercent,
  formatShortTime,
  formatUptime,
  splitBytes,
} from './format';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1, '1 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 ** 2, '1.0 MB'],
    [5.5 * 1024 ** 3, '5.5 GB'],
    [1024 ** 4, '1.0 TB'],
    [1024 ** 5, '1.0 PB'],
  ])('%d -> %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });

  it('stops at PB instead of inventing larger units', () => {
    expect(formatBytes(1024 ** 6)).toBe('1024.0 PB');
  });

  it('honours the decimals argument but never shows decimals for plain bytes', () => {
    expect(formatBytes(1536, 0)).toBe('2 KB');
    expect(formatBytes(1536, 3)).toBe('1.500 KB');
    expect(formatBytes(512, 3)).toBe('512 B');
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'treats invalid input %s as "0 B"',
    (input) => {
      expect(formatBytes(input)).toBe('0 B');
    },
  );
});

describe('splitBytes', () => {
  it('splits value and unit for big-number displays', () => {
    expect(splitBytes(0)).toEqual({ value: '0', unit: 'B' });
    expect(splitBytes(2048)).toEqual({ value: '2.0', unit: 'KB' });
    expect(splitBytes(3.25 * 1024 ** 3)).toEqual({ value: '3.3', unit: 'GB' });
  });

  it('agrees with formatBytes for every magnitude', () => {
    for (const n of [0, 7, 1023, 1024, 99_999, 12_345_678, 9e12]) {
      const { value, unit } = splitBytes(n);
      expect(`${value} ${unit}`).toBe(formatBytes(n));
    }
  });

  it('treats invalid input as 0 B', () => {
    expect(splitBytes(-5)).toEqual({ value: '0', unit: 'B' });
    expect(splitBytes(Number.NaN)).toEqual({ value: '0', unit: 'B' });
  });
});

describe('formatBytesPerSec', () => {
  it('appends /s', () => {
    expect(formatBytesPerSec(2048)).toBe('2.0 KB/s');
    expect(formatBytesPerSec(0)).toBe('0 B/s');
  });
});

describe('formatPercent', () => {
  it('uses one decimal by default', () => {
    expect(formatPercent(12.345)).toBe('12.3%');
    expect(formatPercent(100)).toBe('100.0%');
  });
  it('accepts a custom number of decimals', () => {
    expect(formatPercent(12.345, 0)).toBe('12%');
    expect(formatPercent(12.345, 2)).toBe('12.35%');
  });
});

describe('formatUptime', () => {
  it.each([
    [null, '—'],
    [0, '0m'],
    [59, '0m'],
    [60, '1m'],
    [3599, '59m'],
    [3600, '1h 0m'],
    [3 * 3600 + 25 * 60, '3h 25m'],
    [86_399, '23h 59m'],
    [86_400, '1d 0h 0m'],
    [2 * 86_400 + 5 * 3600 + 7 * 60, '2d 5h 7m'],
  ])('%s -> %s', (input, expected) => {
    expect(formatUptime(input)).toBe(expected);
  });
});

describe('formatShortTime', () => {
  it('renders the time of day in the local format', () => {
    const ts = new Date(2024, 0, 15, 13, 5, 9).getTime();
    expect(formatShortTime(ts)).toBe(new Date(ts).toLocaleTimeString());
    expect(formatShortTime(ts)).toMatch(/1[\s\S]*5[\s\S]*9/);
  });
});
