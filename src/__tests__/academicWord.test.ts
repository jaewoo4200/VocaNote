import { describe, expect, it } from 'vitest';
import { findAcademicWordSuggestions } from '../lib/academicWord';

describe('academic word suggestions', () => {
  it('returns suggestions for english academic term query', () => {
    const items = findAcademicWordSuggestions('resilience', ['engineering'], []);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].term).toBe('resilience');
    expect(items[0].meaningKo).toContain('회복');
  });

  it('supports korean meaning keyword query', () => {
    const items = findAcademicWordSuggestions('수렴', ['optimization'], []);
    expect(items.some((item) => item.term === 'convergence')).toBe(true);
  });
});
