import { describe, expect, it } from 'vitest';
import {
  findAcademicAbbrevSuggestions,
  parseAbbrevDataset,
  setAbbrevSeeds
} from '../lib/academicAbbrev';

describe('parseAbbrevDataset', () => {
  it('maps {abbr, full, ko, domains} rows to seeds and skips invalid ones', () => {
    const seeds = parseAbbrevDataset([
      { abbr: 'OFDM', full: 'Orthogonal Frequency Division Multiplexing', ko: '직교 주파수 분할 다중화', domains: ['comm'] },
      { abbr: '', full: 'x', ko: 'y' },
      { abbr: 'NOKO', full: 'No Korean' },
      { abbr: 'BARE', ko: '뜻만' }
    ]);
    expect(seeds).toEqual([
      { abbr: 'OFDM', fullExpansion: 'Orthogonal Frequency Division Multiplexing', meaningKo: '직교 주파수 분할 다중화', domains: ['comm'] },
      { abbr: 'BARE', fullExpansion: 'BARE', meaningKo: '뜻만', domains: [] }
    ]);
  });

  it('ignores non-array input', () => {
    expect(parseAbbrevDataset(null)).toEqual([]);
    expect(parseAbbrevDataset({})).toEqual([]);
  });
});

describe('findAcademicAbbrevSuggestions with merged dataset', () => {
  it('surfaces a loaded EE/comms abbreviation by prefix', () => {
    setAbbrevSeeds(
      parseAbbrevDataset([
        { abbr: 'MIMO', full: 'Multiple-Input Multiple-Output', ko: '다중 입출력 안테나', domains: ['comm'] }
      ])
    );
    const results = findAcademicAbbrevSuggestions('mim', [], []);
    expect(results.some((r) => r.abbr === 'MIMO')).toBe(true);
  });

  it('still includes a built-in seed after merging', () => {
    const results = findAcademicAbbrevSuggestions('llm', [], []);
    expect(results.some((r) => r.abbr === 'LLM')).toBe(true);
  });
});
