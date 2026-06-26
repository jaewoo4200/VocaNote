import { beforeAll, describe, expect, it } from 'vitest';
import { buildWordlistIndex, isWordlistReady, queryWordlist } from '../lib/wordlist';

// Frequency-ordered (most common first), as the real asset is.
const WORDS = [
  'apple',
  'apply',
  'application',
  'approach',
  'appreciate',
  'banana',
  'band',
  'apex',
  'ap'
];

describe('wordlist prefix index', () => {
  beforeAll(() => {
    buildWordlistIndex(WORDS);
  });

  it('marks the list ready after building', () => {
    expect(isWordlistReady()).toBe(true);
  });

  it('returns frequency-ordered prefix matches', () => {
    expect(queryWordlist('app', 3)).toEqual(['apple', 'apply', 'application']);
  });

  it('handles a single-character prefix', () => {
    const result = queryWordlist('a', 4);
    expect(result[0]).toBe('apple');
    expect(result.every((word) => word.startsWith('a'))).toBe(true);
  });

  it('narrows results as the prefix grows', () => {
    expect(queryWordlist('appl', 5)).toEqual(['apple', 'apply', 'application']);
  });

  it('respects the limit', () => {
    expect(queryWordlist('a', 2)).toHaveLength(2);
  });

  it('returns an empty array for a non-matching or empty prefix', () => {
    expect(queryWordlist('zzz', 5)).toEqual([]);
    expect(queryWordlist('', 5)).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(queryWordlist('APP', 1)).toEqual(['apple']);
  });
});
