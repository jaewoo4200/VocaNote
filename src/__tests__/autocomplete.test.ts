import { describe, expect, it } from 'vitest';
import { buildAutocompleteSuggestions } from '../lib/autocomplete';
import type { VocabEntry } from '../types';

const entry = (term: string, meaningKo?: string): VocabEntry => ({
  stableKey: `${term.toLowerCase()}::word`,
  type: 'word',
  term,
  termNorm: term.toLowerCase(),
  meaningKo,
  tags: [],
  notes: '',
  favorite: false,
  expansions: [],
  createdAt: 1,
  updatedAt: 1
});

describe('buildAutocompleteSuggestions', () => {
  it('orders sources: entries, then live Daum, then dictionary words', () => {
    const suggestions = buildAutocompleteSuggestions({
      query: 'res',
      entries: [entry('reset', '재설정')],
      preferredDomains: [],
      liveSuggestions: [
        { term: 'resilience', meaningKo: '탄성, 복원력, 탄력' },
        { term: 'resilient', meaningKo: '회복력 있는' }
      ],
      dictionaryMatches: ['research', 'resilience']
    });

    expect(suggestions[0]).toMatchObject({ term: 'reset', source: 'entry' });
    expect(suggestions[1]).toMatchObject({ term: 'resilience', source: 'daum', meaningKo: '탄성, 복원력, 탄력' });
    // 'resilience' from the dictionary list is deduped against the Daum match.
    expect(suggestions.filter((s) => s.term.toLowerCase() === 'resilience')).toHaveLength(1);
    expect(suggestions.some((s) => s.term === 'research' && s.source === 'dictionary')).toBe(true);
  });

  it('keeps the live Daum Korean meaning over a bare dictionary word', () => {
    const suggestions = buildAutocompleteSuggestions({
      query: 'app',
      entries: [],
      preferredDomains: [],
      liveSuggestions: [{ term: 'apple', meaningKo: '사과' }],
      dictionaryMatches: ['apple', 'application']
    });
    const apple = suggestions.find((s) => s.term === 'apple');
    expect(apple).toMatchObject({ source: 'daum', meaningKo: '사과' });
  });

  it('ranks entries with a saved meaning above undefined ones', () => {
    const suggestions = buildAutocompleteSuggestions({
      query: 're',
      entries: [entry('reset'), entry('resilience', '회복력')],
      preferredDomains: []
    });
    expect(suggestions[0].term).toBe('resilience');
  });

  it('only includes prefix matches across all sources', () => {
    const suggestions = buildAutocompleteSuggestions({
      query: 'app',
      entries: [entry('apple', '사과')],
      preferredDomains: [],
      liveSuggestions: [{ term: 'banana', meaningKo: '바나나' }],
      dictionaryMatches: ['application', 'snap']
    });
    expect(suggestions.every((s) => s.term.toLowerCase().startsWith('app'))).toBe(true);
  });

  it('respects the limit', () => {
    const dict = Array.from({ length: 50 }, (_, i) => `app${i}`);
    const suggestions = buildAutocompleteSuggestions({
      query: 'app',
      entries: [],
      preferredDomains: [],
      dictionaryMatches: dict,
      limit: 8
    });
    expect(suggestions).toHaveLength(8);
  });

  it('returns nothing for an empty query', () => {
    expect(
      buildAutocompleteSuggestions({ query: '  ', entries: [entry('apple', '사과')], preferredDomains: [] })
    ).toEqual([]);
  });
});
