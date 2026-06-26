import { describe, expect, it } from 'vitest';
import { validateBackupPayload } from '../lib/backup';
import type { VocabEntry } from '../types';

const entry: VocabEntry = {
  stableKey: 'hello::word',
  type: 'word',
  term: 'hello',
  termNorm: 'hello',
  meaningKo: '안녕',
  tags: [],
  notes: '',
  favorite: false,
  expansions: [],
  createdAt: 1,
  updatedAt: 1
};

describe('validateBackupPayload', () => {
  it('accepts a well-formed payload', () => {
    const payload = validateBackupPayload({
      schemaVersion: 1,
      exportedAt: '2024-01-01T00:00:00.000Z',
      entries: [entry],
      history: [{ termNorm: 'hello', term: 'hello', lastSeenAt: 1, seenCount: 1 }]
    });
    expect(payload.entries).toHaveLength(1);
    expect(payload.history).toHaveLength(1);
  });

  it('accepts an empty-but-structured payload', () => {
    const payload = validateBackupPayload({ entries: [], history: [] });
    expect(payload.entries).toEqual([]);
    expect(payload.schemaVersion).toBeTypeOf('number');
  });

  it('rejects non-objects', () => {
    expect(() => validateBackupPayload(null)).toThrow();
    expect(() => validateBackupPayload('nope')).toThrow();
    expect(() => validateBackupPayload([])).toThrow();
  });

  it('rejects payloads missing the required arrays', () => {
    expect(() => validateBackupPayload({ entries: [entry] })).toThrow();
    expect(() => validateBackupPayload({ history: [] })).toThrow();
  });

  it('rejects entries that do not look like vocab entries', () => {
    expect(() =>
      validateBackupPayload({ entries: [{ foo: 'bar' }], history: [] })
    ).toThrow();
  });
});
