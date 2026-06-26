import { describe, expect, it } from 'vitest';
import { parseLlmJson } from '../lib/llmImport';

describe('parseLlmJson', () => {
  it('parses a clean JSON array', () => {
    const rows = parseLlmJson(
      '[{"term":"OFDM","meaningKo":"직교 주파수 분할 다중화","type":"abbr","fullExpansion":"Orthogonal Frequency Division Multiplexing","tags":["comm"]}]'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      term: 'OFDM',
      meaningKo: '직교 주파수 분할 다중화',
      type: 'abbr',
      fullExpansion: 'Orthogonal Frequency Division Multiplexing',
      tags: ['comm']
    });
  });

  it('strips a ```json code fence and surrounding prose', () => {
    const raw = '여기 결과입니다:\n```json\n[{"term":"ubiquitous","meaningKo":"어디에나 있는"}]\n```\n도움이 되었길!';
    const rows = parseLlmJson(raw);
    expect(rows[0]).toMatchObject({ term: 'ubiquitous', meaningKo: '어디에나 있는' });
  });

  it('infers abbr type when fullExpansion is present and type missing', () => {
    const rows = parseLlmJson('[{"term":"MIMO","meaning":"다중 입출력","full":"Multiple-Input Multiple-Output"}]');
    expect(rows[0]).toMatchObject({ term: 'MIMO', type: 'abbr', meaningKo: '다중 입출력', fullExpansion: 'Multiple-Input Multiple-Output' });
  });

  it('accepts an { entries: [...] } wrapper and skips rows without a term', () => {
    const rows = parseLlmJson('{"entries":[{"term":"SNR","meaningKo":"신호 대 잡음비"},{"meaningKo":"빈 term"}]}');
    expect(rows).toHaveLength(1);
    expect(rows[0].term).toBe('SNR');
  });

  it('normalizes tags/domains given as a comma string', () => {
    const rows = parseLlmJson('[{"term":"BER","meaningKo":"비트 오류율","tags":"comm, metric"}]');
    expect(rows[0].tags).toEqual(['comm', 'metric']);
  });

  it('throws on input with no JSON', () => {
    expect(() => parseLlmJson('아무 JSON도 없는 평범한 문장')).toThrow();
  });

  it('returns empty for blank input', () => {
    expect(parseLlmJson('   ')).toEqual([]);
  });
});
