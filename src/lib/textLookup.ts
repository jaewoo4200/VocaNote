import { normalizeTerm } from './normalize';

export interface LookupFetchResult {
  text: string;
  viaProxy: boolean;
}

const DIRECT_TIMEOUT_MS = 2200;
const PROXY_TIMEOUT_MS = 14000;

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return error.name === 'AbortError' || message.includes('aborted') || message.includes('abort');
}

function toJinaProxyUrl(url: string): string {
  if (url.startsWith('https://')) {
    return `https://r.jina.ai/http://${url.slice('https://'.length)}`;
  }
  if (url.startsWith('http://')) {
    return `https://r.jina.ai/http://${url.slice('http://'.length)}`;
  }
  return `https://r.jina.ai/http://${url}`;
}

function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 600).toLowerCase();
  return head.includes('<html') || head.includes('<body') || head.includes('<div') || head.includes('<meta');
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript,svg').forEach((node) => node.remove());
  return doc.body?.textContent ?? doc.documentElement?.textContent ?? html;
}

function normalizeLines(text: string): string[] {
  return text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function unmarkdown(line: string): string {
  return line
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[-*•]\s*/, '')
    .replace(/[`_]/g, '')
    .replace(/\s+([,.!?;:)\]])/g, '$1')
    .replace(/([(［【])\s+/g, '$1')
    .trim();
}

function cleanLines(text: string): string[] {
  return normalizeLines(text)
    .map(unmarkdown)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function isSectionBoundary(line: string): boolean {
  return /^(관련어|예문|복합어|유의어|테마 단어)/.test(line);
}

function isNoiseLine(line: string, termNorm: string): boolean {
  const normalized = normalizeTerm(line);
  const candidate = normalized.replace(/^\d+[\.\)]\s*/, '').trim();
  if (!normalized) {
    return true;
  }

  if (candidate === termNorm) {
    return true;
  }

  const menuKeywords = [
    '메뉴',
    '바로가기',
    '검색폼',
    '검색창',
    '본문 바로가기',
    '어학사전',
    '영어사전',
    '다른 사전',
    '사전홈',
    '사전 본문',
    '단어장',
    '네이버 사전',
    'naver dictionary',
    'dictionary home',
    'korean english dictionary',
    '검색어'
  ];

  if (menuKeywords.some((keyword) => candidate.includes(keyword))) {
    return true;
  }

  if (candidate.includes('|')) {
    const parts = candidate.split('|').map((part) => part.trim()).filter(Boolean);
    if (
      parts.length >= 2 &&
      parts.every(
        (part) =>
          part.length <= 10 || menuKeywords.some((keyword) => part.includes(keyword)) || part.includes('홈')
      )
    ) {
      return true;
    }
  }

  if (/^다른 사전\|단어장\|사전홈\|사전 본문/.test(candidate)) {
    return true;
  }

  return (
    candidate.startsWith('url source:') ||
    candidate.startsWith('title:') ||
    candidate.startsWith('markdown content:') ||
    candidate.startsWith('기본 ') ||
    candidate.startsWith('복수 ') ||
    candidate.includes('더보기') ||
    candidate.includes('https://') ||
    candidate.includes('http://') ||
    candidate.includes(' ted') ||
    candidate.includes(' image ') ||
    /\d+건$/.test(candidate) ||
    candidate.startsWith('참고') ||
    candidate.startsWith('어원')
  );
}

function isPartOfSpeech(line: string): boolean {
  return /^(명사|동사|형용사|부사|전치사|대명사|감탄사)$/.test(line);
}

function takeDefinitionSection(lines: string[]): string[] {
  const startIndex = lines.findIndex((line) => line.includes('뜻/문법'));
  if (startIndex < 0) {
    return lines;
  }

  const body = lines.slice(startIndex + 1);
  const endIndex = body.findIndex((line) => isSectionBoundary(line));
  return endIndex >= 0 ? body.slice(0, endIndex) : body;
}

function extractNumberedMeanings(lines: string[], termNorm: string): string[] {
  const meanings: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }

    const inlineMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (inlineMatch) {
      const sense = inlineMatch[2].trim();
      if (!isNoiseLine(sense, termNorm)) {
        meanings.push(sense);
      }
      continue;
    }

    if (!/^\d+\.$/.test(line)) {
      continue;
    }

    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const candidate = lines[nextIndex];
      if (!candidate || /^\d+(\.|\. )/.test(candidate) || isSectionBoundary(candidate)) {
        break;
      }
      if (isPartOfSpeech(candidate) || isNoiseLine(candidate, termNorm)) {
        continue;
      }
      meanings.push(candidate);
      break;
    }
  }

  return Array.from(new Set(meanings));
}

function extractFallbackMeanings(lines: string[], termNorm: string): string[] {
  return Array.from(
    new Set(
      lines.filter((line) => {
        if (isNoiseLine(line, termNorm)) {
          return false;
        }
        if (isPartOfSpeech(line)) {
          return false;
        }
        if (line.length < 3) {
          return false;
        }
        return /[가-힣]/.test(line);
      })
    )
  ).slice(0, 4);
}

function buildMeaningSummary(text: string, term: string, maxMeanings: number): string {
  const lines = cleanLines(text);
  if (lines.length === 0) {
    return '주요 뜻을 찾지 못했습니다.';
  }

  const termNorm = normalizeTerm(term);
  const section = takeDefinitionSection(lines);
  const partOfSpeech = section.find((line) => isPartOfSpeech(line));
  const numbered = extractNumberedMeanings(section, termNorm);
  const fallbacks = extractFallbackMeanings(section, termNorm);
  const meanings = (numbered.length > 0 ? numbered : fallbacks).slice(0, maxMeanings);

  if (meanings.length === 0) {
    return '주요 뜻을 찾지 못했습니다.';
  }

  const header = partOfSpeech ? `품사: ${partOfSpeech}` : '품사: -';
  const body = meanings.map((meaning, idx) => `${idx + 1}. ${meaning}`);
  return ['주요 뜻', header, ...body].join('\n');
}

async function fetchRawText(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,text/plain;q=0.9,*/*;q=0.8'
      }
    });
  } catch (error) {
    if (timedOut || isAbortLikeError(error)) {
      throw new Error('사전 응답 지연으로 조회 시간이 초과되었습니다.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.text();
}

export async function fetchLookupText(url: string): Promise<LookupFetchResult> {
  const attempts: Array<{ url: string; viaProxy: boolean; timeoutMs: number }> = [
    { url, viaProxy: false, timeoutMs: DIRECT_TIMEOUT_MS },
    { url: toJinaProxyUrl(url), viaProxy: true, timeoutMs: PROXY_TIMEOUT_MS }
  ];

  let lastError: unknown;

  for (const attempt of attempts) {
    try {
      const raw = await fetchRawText(attempt.url, attempt.timeoutMs);
      const text = looksLikeHtml(raw) ? stripHtml(raw) : raw;
      const lines = normalizeLines(text);
      if (lines.length === 0) {
        throw new Error('텍스트를 추출하지 못했습니다.');
      }

      return {
        text: lines.join('\n'),
        viaProxy: attempt.viaProxy
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error('텍스트 조회에 실패했습니다.');
}

export function selectLookupPreview(text: string, term: string, maxMeanings: number = 4): string {
  return buildMeaningSummary(text, term, maxMeanings);
}
