import { describe, expect, it } from 'vitest';
import { entriesToAbbrCsv, entriesToWordCsv, parseImportInput } from '../lib/csv';
import type { VocabEntry } from '../types';

const baseEntry: VocabEntry = {
  stableKey: 'api::abbr',
  type: 'abbr',
  term: 'API',
  termNorm: 'api',
  tags: [],
  notes: '',
  favorite: false,
  expansions: [],
  createdAt: 1,
  updatedAt: 1
};

describe('csv parser', () => {
  it('parses csv headers and values', () => {
    const raw = `term,meaningKo,type,fullExpansion,domains,tags,notes,favorite\nAPI,응용 프로그래밍 인터페이스,abbr,Application Programming Interface,backend|web,tech,common,true`;
    const parsed = parseImportInput(raw, 'auto');

    expect(parsed.mode).toBe('csv');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].type).toBe('abbr');
    expect(parsed.rows[0].domains).toEqual(['backend', 'web']);
    expect(parsed.rows[0].favorite).toBe(true);
  });

  it('parses plain text list into deduped terms', () => {
    const raw = `hello\nworld\nhello`;
    const parsed = parseImportInput(raw, 'auto');

    expect(parsed.mode).toBe('text');
    expect(parsed.rows).toEqual([
      { term: 'hello', type: 'word' },
      { term: 'world', type: 'word' }
    ]);
  });

  it('exports word csv with required headers', () => {
    const csv = entriesToWordCsv([
      {
        ...baseEntry,
        stableKey: 'hello::word',
        type: 'word',
        term: 'hello',
        termNorm: 'hello',
        meaningKo: '안녕'
      }
    ]);

    expect(csv).toContain('term');
    expect(csv).toContain('hello');
    expect(csv).toContain('안녕');
  });

  it('exports abbr csv with expansion rows', () => {
    const csv = entriesToAbbrCsv([
      {
        ...baseEntry,
        expansions: [
          {
            id: 'exp1',
            fullExpansion: 'Application Programming Interface',
            meaningKo: '응용 인터페이스',
            domains: ['backend'],
            tags: ['tech'],
            notes: '',
            favorite: false,
            updatedAt: 1
          }
        ]
      }
    ]);

    expect(csv).toContain('Application Programming Interface');
    expect(csv).toContain('응용 인터페이스');
  });
});
