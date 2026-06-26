import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLookupText, selectLookupPreview } from '../lib/textLookup';

describe('text lookup utils', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('extracts major meanings from daum-style markdown blocks', () => {
    const raw = [
      'Title: Daum 사전',
      'Markdown Content:',
      '#### 뜻/문법',
      '**명사**',
      '1.',
      '(의견 등 의) 일치,조화',
      '참고[어원] 라틴어',
      '2.',
      '대다수 의 의견, 총의, 합의, 여론',
      '#### 관련어',
      '* [accord](https://dic.daum.net/word/view.do?q=accord)협정'
    ].join('\n');

    const preview = selectLookupPreview(raw, 'consensus', 3);

    expect(preview).toContain('주요 뜻');
    expect(preview).toContain('품사: 명사');
    expect(preview).toContain('1. (의견 등 의) 일치,조화');
    expect(preview).toContain('2. 대다수 의 의견, 총의, 합의, 여론');
    expect(preview).not.toContain('관련어');
    expect(preview).not.toContain('accord');
    expect(preview).not.toContain('참고');
  });

  it('returns fallback message when no meaning lines exist', () => {
    const preview = selectLookupPreview('Title: Empty\nMarkdown Content:', 'consensus');
    expect(preview).toContain('주요 뜻을 찾지 못했습니다.');
  });

  it('treats menu/navigation dump as no result', () => {
    const raw = [
      '1. resilience - 다음 영어사전 (Daum Korean English dictionary)',
      '2. 메뉴 바로가기/본문 바로가기',
      '3. 검색폼',
      '4. 어학사전 검색창 검색하기'
    ].join('\n');

    const preview = selectLookupPreview(raw, 'resilience');
    expect(preview).toContain('주요 뜻을 찾지 못했습니다.');
  });

  it('treats nav bars like "다른 사전|단어장|사전홈|사전 본문" as no result', () => {
    const raw = [
      '1) 다른 사전|',
      '2) 단어장|',
      '3) 사전홈',
      '4) 사전 본문'
    ].join('\n');

    const preview = selectLookupPreview(raw, 'consensus');
    expect(preview).toContain('주요 뜻을 찾지 못했습니다.');
  });

  it('falls back to proxy when direct fetch fails', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('CORS blocked'))
      .mockResolvedValueOnce(new Response('harness\nmeaning', { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLookupText('https://dic.daum.net/search.do?q=harness');

    expect(result.viaProxy).toBe(true);
    expect(result.text).toContain('harness');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('https://r.jina.ai/http://dic.daum.net');
  });

  it('maps abort-like fetch failures to timeout-friendly message', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('signal is aborted without reason'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchLookupText('https://dic.daum.net/search.do?q=timeout')).rejects.toThrow(
      '사전 응답 지연으로 조회 시간이 초과되었습니다.'
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
