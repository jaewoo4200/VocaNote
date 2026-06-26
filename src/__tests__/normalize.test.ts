import { describe, expect, it } from 'vitest';
import { createStableKey, normalizeListField, normalizeTerm, parseBoolean } from '../lib/normalize';

describe('normalize utils', () => {
  it('normalizes term with trim and lowercase', () => {
    expect(normalizeTerm('  HTTP  Server  ')).toBe('http server');
  });

  it('creates stable key from term and type', () => {
    expect(createStableKey('API', 'abbr')).toBe('api::abbr');
  });

  it('parses list fields with de-duplication', () => {
    expect(normalizeListField('web, infra;web|ops')).toEqual(['web', 'infra', 'ops']);
  });

  it('parses booleans from text values', () => {
    expect(parseBoolean('YES')).toBe(true);
    expect(parseBoolean('0')).toBe(false);
  });
});
