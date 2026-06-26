import { describe, expect, it } from 'vitest';
import { searchEntries } from '../lib/search';
import { findAcademicAbbrevSuggestions } from '../lib/academicAbbrev';
import type { VocabEntry } from '../types';

const baseEntry: VocabEntry = {
  stableKey: 'llm::abbr',
  type: 'abbr',
  term: 'LLM',
  termNorm: 'llm',
  tags: [],
  notes: '',
  favorite: false,
  expansions: [
    {
      id: 'exp1',
      fullExpansion: 'Large Language Model',
      meaningKo: '대규모 언어 모델',
      domains: ['ai', 'nlp'],
      tags: ['academic'],
      notes: '',
      favorite: false,
      updatedAt: 1
    }
  ],
  createdAt: 1,
  updatedAt: 1
};

describe('search enhancements', () => {
  it('matches abbreviation by full expansion text', () => {
    const results = searchEntries([baseEntry], 'large language model', ['ai']);
    expect(results).toHaveLength(1);
    expect(results[0].entry.term).toBe('LLM');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('returns academic suggestions for paper-style query', () => {
    const suggestions = findAcademicAbbrevSuggestions('llm', ['nlp'], []);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].abbr).toBe('LLM');
    expect(suggestions[0].domains).toContain('nlp');
  });
});
