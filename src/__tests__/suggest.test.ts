import { describe, expect, it } from 'vitest';
import {
  inferSuggestEngine,
  parseDaumDictPayload,
  parseDaumSearchPayload,
  parseNaverDictPayload,
  parseNaverSearchPayload
} from '../lib/suggest';

describe('parseDaumDictPayload', () => {
  it('parses word + Korean meaning from the pipe-delimited item', () => {
    const payload = {
      q: 'resil',
      items: {
        eng: [
          { item: 'kuek|resile|원래의 형태로 돌아가다, 회복력이 있다', key: 'resile' },
          { item: 'kuek|resilience|탄성, 복원력, 탄력', key: 'resilience' }
        ]
      }
    };

    const result = parseDaumDictPayload(payload, 'eng');
    expect(result).toEqual([
      { term: 'resile', meaningKo: '원래의 형태로 돌아가다, 회복력이 있다' },
      { term: 'resilience', meaningKo: '탄성, 복원력, 탄력' }
    ]);
  });

  it('keeps a meaning that itself contains a pipe', () => {
    const payload = { items: { eng: [{ item: 'c|api|응용 | 인터페이스' }] } };
    expect(parseDaumDictPayload(payload, 'eng')[0]).toEqual({
      term: 'api',
      meaningKo: '응용 | 인터페이스'
    });
  });

  it('returns empty for a missing category or malformed payload', () => {
    expect(parseDaumDictPayload({ items: {} }, 'eng')).toEqual([]);
    expect(parseDaumDictPayload(null, 'eng')).toEqual([]);
    expect(parseDaumDictPayload({ items: { eng: [{ item: '' }] } }, 'eng')).toEqual([]);
  });
});

describe('parseDaumSearchPayload', () => {
  it('extracts subkeys as terms', () => {
    const payload = { q: 'resil', subkeys: ['resilience', 'resilient', ''] };
    expect(parseDaumSearchPayload(payload)).toEqual([
      { term: 'resilience' },
      { term: 'resilient' }
    ]);
  });

  it('returns empty for a malformed payload', () => {
    expect(parseDaumSearchPayload({})).toEqual([]);
    expect(parseDaumSearchPayload(null)).toEqual([]);
  });
});

describe('parseNaverDictPayload', () => {
  it('parses word + meaning from nested item arrays', () => {
    const payload = {
      query: ['resil'],
      items: [
        [
          [['resilience'], [''], ['회복력, 탄성, 탄력, 복원력']],
          [['resilient'], [''], ['회복력 있는, 탄력 있는']]
        ],
        []
      ]
    };
    expect(parseNaverDictPayload(payload)).toEqual([
      { term: 'resilience', meaningKo: '회복력, 탄성, 탄력, 복원력' },
      { term: 'resilient', meaningKo: '회복력 있는, 탄력 있는' }
    ]);
  });

  it('returns empty for malformed payload', () => {
    expect(parseNaverDictPayload({ items: 'nope' })).toEqual([]);
    expect(parseNaverDictPayload(null)).toEqual([]);
  });
});

describe('parseNaverSearchPayload', () => {
  it('extracts terms from nested item arrays', () => {
    const payload = { query: ['resil'], items: [[['resilience'], ['resilient']]] };
    expect(parseNaverSearchPayload(payload)).toEqual([
      { term: 'resilience' },
      { term: 'resilient' }
    ]);
  });
});

describe('inferSuggestEngine', () => {
  it('detects naver vs daum from provider hints, defaulting to daum', () => {
    expect(inferSuggestEngine('naver-dictionary')).toBe('naver');
    expect(inferSuggestEngine('daum-dictionary')).toBe('daum');
    expect(inferSuggestEngine('custom', 'https://search.naver.com/...')).toBe('naver');
    expect(inferSuggestEngine('whatever')).toBe('daum');
  });
});
