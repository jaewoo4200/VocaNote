// Live autocomplete from Daum and Naver suggest endpoints — the same ones the
// Alfred "Daum Search" / "Naver Search" workflows use. None send CORS headers,
// but all support a JSONP `callback` param, so from a static (GitHub Pages)
// browser app we load them via a <script> tag. CSP `script-src` is scoped to
// exactly these suggest hosts.
//
//   Daum dict   : suggest.dic.daum.net/language/v1/search.json?cate=eng&q=…
//                 items.eng[].item = "code|word|뜻1, 뜻2…"      (Korean meanings)
//   Daum search : vsuggest.search.daum.net/sushi/pc/get?…&q=…   subkeys=[…]
//   Naver dict  : ac-dict.naver.com/enko/ac?st=11001&…&q=…      items[0]=[[word],[],[meaning]]
//   Naver search: ac.search.naver.com/nx/ac?…&q=…               items[0]=[[word],…]

export interface Suggestion {
  term: string;
  meaningKo?: string;
}

export type SuggestEngine = 'daum' | 'naver';
export type SuggestSource = 'dictionary' | 'search';

const JSONP_TIMEOUT_MS = 2500;
let callbackCounter = 0;

function abortError(): DOMException {
  return new DOMException('Request aborted', 'AbortError');
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function inferSuggestEngine(providerId?: string, template?: string): SuggestEngine {
  const hint = `${providerId ?? ''} ${template ?? ''}`.toLowerCase();
  return hint.includes('naver') ? 'naver' : 'daum';
}

function jsonp(
  url: string,
  params: Record<string, string | number>,
  callbackParam: string,
  signal?: AbortSignal
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const globalScope = window as unknown as Record<string, unknown>;
    const callbackName = `__voca_sg_${Date.now().toString(36)}_${callbackCounter++}`;
    const query = Object.entries({ ...params, [callbackParam]: callbackName })
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');
    const separator = url.includes('?') ? '&' : '?';
    const script = document.createElement('script');
    let settled = false;
    let timer = 0;

    const cleanup = () => {
      window.clearTimeout(timer);
      script.onerror = null;
      script.remove();
      delete globalScope[callbackName];
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (run: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      run();
    };
    const onAbort = () => finish(() => reject(abortError()));

    globalScope[callbackName] = (payload: unknown) => finish(() => resolve(payload));
    script.src = `${url}${separator}${query}`;
    script.async = true;
    script.onerror = () => finish(() => reject(new Error('JSONP load failed')));
    timer = window.setTimeout(() => finish(() => reject(new Error('JSONP timeout'))), JSONP_TIMEOUT_MS);
    signal?.addEventListener('abort', onAbort, { once: true });
    document.head.appendChild(script);
  });
}

// ---------- pure parsers (unit-testable without network) ----------

export function parseDaumDictPayload(payload: unknown, cate = 'eng'): Suggestion[] {
  const items = (payload as { items?: Record<string, unknown> })?.items?.[cate];
  if (!Array.isArray(items)) {
    return [];
  }
  const out: Suggestion[] = [];
  for (const row of items) {
    const item = typeof (row as { item?: unknown })?.item === 'string' ? (row as { item: string }).item : '';
    if (!item) {
      continue;
    }
    const parts = item.split('|');
    const term = (parts.length >= 2 ? parts[1] : parts[0]).trim();
    const meaningKo = parts.length >= 3 ? parts.slice(2).join('|').trim() : undefined;
    if (term) {
      out.push({ term, meaningKo: meaningKo || undefined });
    }
  }
  return out;
}

export function parseDaumSearchPayload(payload: unknown): Suggestion[] {
  const subkeys = (payload as { subkeys?: unknown })?.subkeys;
  if (!Array.isArray(subkeys)) {
    return [];
  }
  return subkeys
    .filter((value): value is string => typeof value === 'string')
    .map((term) => ({ term: term.trim() }))
    .filter((suggestion) => suggestion.term.length > 0);
}

export function parseNaverDictPayload(payload: unknown): Suggestion[] {
  const groups = (payload as { items?: unknown })?.items;
  if (!Array.isArray(groups)) {
    return [];
  }
  const out: Suggestion[] = [];
  for (const group of groups) {
    if (!Array.isArray(group)) {
      continue;
    }
    for (const entry of group) {
      // entry shape: [["word"], ["..."], ["뜻"]]
      const term = Array.isArray(entry?.[0]) ? String(entry[0][0] ?? '').trim() : '';
      const meaningKo = Array.isArray(entry?.[2]) ? String(entry[2][0] ?? '').trim() : '';
      if (term) {
        out.push({ term, meaningKo: meaningKo || undefined });
      }
    }
  }
  return out;
}

export function parseNaverSearchPayload(payload: unknown): Suggestion[] {
  const groups = (payload as { items?: unknown })?.items;
  if (!Array.isArray(groups)) {
    return [];
  }
  const out: Suggestion[] = [];
  for (const group of groups) {
    if (!Array.isArray(group)) {
      continue;
    }
    for (const entry of group) {
      const term = Array.isArray(entry) ? String(entry[0] ?? '').trim() : String(entry ?? '').trim();
      if (term) {
        out.push({ term });
      }
    }
  }
  return out;
}

// ---------- fetchers ----------

async function fetchDaumDict(query: string, cate: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const payload = await jsonp(
    'https://suggest.dic.daum.net/language/v1/search.json',
    { cate, q: query },
    'callback',
    signal
  );
  return parseDaumDictPayload(payload, cate);
}

async function fetchDaumSearch(query: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const payload = await jsonp(
    'https://vsuggest.search.daum.net/sushi/pc/get',
    { mod: 'json', code: 'utf_in_out', q: query },
    'callback',
    signal
  );
  return parseDaumSearchPayload(payload);
}

async function fetchNaverDict(query: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const payload = await jsonp(
    'https://ac-dict.naver.com/enko/ac',
    { q_enc: 'utf-8', st: 11001, r_format: 'json', r_enc: 'utf-8', r_lt: 10001, r_unicode: 0, r_escape: 1, q: query },
    '_callback',
    signal
  );
  return parseNaverDictPayload(payload);
}

async function fetchNaverSearch(query: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const payload = await jsonp(
    'https://ac.search.naver.com/nx/ac',
    { q_enc: 'UTF-8', st: 100, r_format: 'json', r_enc: 'UTF-8', r_unicode: 0, t_koreng: 1, q: query },
    '_callback',
    signal
  );
  return parseNaverSearchPayload(payload);
}

export async function fetchLiveSuggestions(
  query: string,
  engine: SuggestEngine,
  source: SuggestSource,
  cate = 'eng',
  signal?: AbortSignal
): Promise<Suggestion[]> {
  if (engine === 'naver') {
    return source === 'search' ? fetchNaverSearch(query, signal) : fetchNaverDict(query, signal);
  }
  return source === 'search' ? fetchDaumSearch(query, signal) : fetchDaumDict(query, cate, signal);
}

/**
 * Fast single-result meaning for the Enter/lookup flow: hit the dictionary
 * suggest endpoint and return the best (exact, else first) match's Korean
 * meaning. Used to show an instant result while the slower full-page text
 * lookup loads in the background.
 */
export async function fetchQuickMeaning(
  term: string,
  engine: SuggestEngine,
  cate = 'eng',
  signal?: AbortSignal
): Promise<Suggestion | null> {
  const items =
    engine === 'naver' ? await fetchNaverDict(term, signal) : await fetchDaumDict(term, cate, signal);
  const withMeaning = items.filter((item) => item.meaningKo);
  if (withMeaning.length === 0) {
    return null;
  }
  const norm = term.trim().toLowerCase();
  return withMeaning.find((item) => item.term.toLowerCase() === norm) ?? withMeaning[0];
}
