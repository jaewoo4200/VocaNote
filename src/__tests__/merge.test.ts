import { describe, expect, it } from 'vitest';
import { mergeBackup, mergeEntries, mergeHistory, pruneHistory } from '../lib/merge';
import type { VocabEntry } from '../types';

const word = (updatedAt: number, deletedAt?: number): VocabEntry => ({
  stableKey: 'hello::word',
  type: 'word',
  term: 'hello',
  termNorm: 'hello',
  meaningKo: updatedAt > 1 ? '안녕하세요' : '안녕',
  tags: [],
  notes: '',
  favorite: false,
  expansions: [],
  createdAt: 1,
  updatedAt,
  deletedAt
});

describe('merge logic', () => {
  it('uses latest updatedAt for same stable key', () => {
    const merged = mergeEntries([word(1)], [word(10)]);
    expect(merged[0].updatedAt).toBe(10);
    expect(merged[0].meaningKo).toBe('안녕하세요');
  });

  it('keeps tombstone when delete timestamp is newer', () => {
    const merged = mergeEntries([word(20)], [word(5, 30)]);
    expect(merged[0].deletedAt).toBe(30);
  });

  it('does NOT resurrect a deleted entry when the other side has a newer edit', () => {
    // Device A deletes at t=50; device B edits at t=100 without seeing the delete.
    // Deletion must stay sticky (regression for tombstone-lost-on-concurrent-edit).
    const merged = mergeEntries([word(50, 50)], [word(100)]);
    expect(merged[0].deletedAt).toBe(50);
    expect(merged[0].updatedAt).toBeGreaterThanOrEqual(50);
  });

  it('keeps an expansion tombstone across a concurrent expansion edit', () => {
    const base = (updatedAt: number, deletedAt?: number): VocabEntry => ({
      stableKey: 'pca::abbr',
      type: 'abbr',
      term: 'PCA',
      termNorm: 'pca',
      tags: [],
      notes: '',
      favorite: false,
      expansions: [
        {
          id: 'exp-1',
          fullExpansion: 'Principal Component Analysis',
          domains: [],
          tags: [],
          notes: '',
          favorite: false,
          updatedAt,
          deletedAt
        }
      ],
      createdAt: 1,
      updatedAt: 1
    });

    const merged = mergeEntries([base(40, 40)], [base(90)]);
    expect(merged[0].expansions[0].deletedAt).toBe(40);
  });

  it('merges history with max seenCount and timestamp', () => {
    const merged = mergeHistory(
      [{ termNorm: 'api', term: 'API', lastSeenAt: 1, seenCount: 2 }],
      [{ termNorm: 'api', term: 'api', lastSeenAt: 5, seenCount: 1 }]
    );

    expect(merged[0]).toEqual({
      termNorm: 'api',
      term: 'api',
      lastSeenAt: 5,
      seenCount: 2
    });
  });

  it('prunes history by latest seen order', () => {
    const pruned = pruneHistory(
      [
        { termNorm: 'a', term: 'a', lastSeenAt: 1, seenCount: 1 },
        { termNorm: 'b', term: 'b', lastSeenAt: 2, seenCount: 1 },
        { termNorm: 'c', term: 'c', lastSeenAt: 3, seenCount: 1 }
      ],
      2
    );

    expect(pruned.map((item) => item.termNorm)).toEqual(['c', 'b']);
  });

  it('merges backup payload end-to-end', () => {
    const merged = mergeBackup(
      {
        schemaVersion: 1,
        exportedAt: '2024-01-01T00:00:00.000Z',
        entries: [word(1)],
        history: [{ termNorm: 'hello', term: 'hello', lastSeenAt: 1, seenCount: 1 }]
      },
      {
        schemaVersion: 1,
        exportedAt: '2024-01-02T00:00:00.000Z',
        entries: [word(2)],
        history: [{ termNorm: 'hello', term: 'hello', lastSeenAt: 2, seenCount: 2 }]
      }
    );

    expect(merged.entries[0].updatedAt).toBe(2);
    expect(merged.history[0].seenCount).toBe(2);
  });
});
