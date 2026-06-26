import type { EntryType, ImportRow } from '../types';
import { normalizeListField } from './normalize';

// The copy-paste prompt the user feeds to ChatGPT/Claude/etc. together with a
// paper or passage. It pins the output to a strict JSON array that maps 1:1 to
// ImportRow, so the result can be pasted straight back into the app.
export const LLM_IMPORT_PROMPT = `당신은 영어 논문/원서를 읽는 한국인 전자공학·통신 대학원생을 돕는 어휘 추출기입니다.
아래에 붙여넣는 텍스트(논문/초록/문단)에서 독자가 모를 법한 **전문 용어·약어·고급 영단어**를 골라
한국어 뜻을 달아 주세요.

규칙:
1) 출력은 **오직 JSON 배열 하나**. 코드펜스(\`\`\`)·설명·머리말·꼬리말 절대 금지.
2) 각 원소 형식:
   {
     "term": "표제어(영문)",
     "meaningKo": "간결한 한국어 뜻(쉼표로 여러 뜻)",
     "type": "word" 또는 "abbr",
     "fullExpansion": "약어인 경우 영어 원형 (단어면 빈 문자열)",
     "tags": ["분야 태그", "..."],
     "notes": "맥락상 의미나 짧은 보충설명(없으면 빈 문자열)"
   }
3) 약어(MIMO, OFDM, SNR 등)는 "type":"abbr" 이고 fullExpansion 채우기.
4) 너무 쉬운 일상어(the, data, system 등)는 제외. 논문 이해에 필요한 것 위주로 최대 40개.
5) 중복 제거. term은 원문 표기를 따르되 약어는 대문자로.
6) 한국어 뜻은 사전식으로 간결하게. 불필요한 영어 반복 금지.

예시 출력:
[
  {"term":"OFDM","meaningKo":"직교 주파수 분할 다중화","type":"abbr","fullExpansion":"Orthogonal Frequency Division Multiplexing","tags":["comm","wireless"],"notes":"부반송파 직교성으로 ISI에 강함"},
  {"term":"ubiquitous","meaningKo":"어디에나 있는, 아주 흔한","type":"word","fullExpansion":"","tags":["general"],"notes":""}
]

이제 아래 텍스트에서 추출하세요:
---
[여기에 논문/문단을 붙여넣으세요]
---`;

interface RawLlmRow {
  term?: unknown;
  meaningKo?: unknown;
  meaning?: unknown;
  type?: unknown;
  fullExpansion?: unknown;
  full?: unknown;
  domains?: unknown;
  tags?: unknown;
  notes?: unknown;
  favorite?: unknown;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asType(value: unknown): EntryType | undefined {
  return value === 'word' || value === 'abbr' ? value : undefined;
}

/**
 * Pull the JSON array out of an LLM response that may include code fences or
 * surrounding prose, and map it to ImportRow[]. Throws on no parseable JSON.
 */
export function parseLlmJson(raw: string): ImportRow[] {
  const text = raw.trim();
  if (!text) {
    return [];
  }

  // Strip a ```json ... ``` (or plain ```) code fence if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;

  const parsed = tryParseJsonish(candidate);
  if (parsed === undefined) {
    throw new Error('JSON을 찾지 못했습니다. LLM 출력 전체(배열)를 붙여넣었는지 확인하세요.');
  }

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { entries?: unknown }).entries)
      ? (parsed as { entries: unknown[] }).entries
      : Array.isArray((parsed as { words?: unknown }).words)
        ? (parsed as { words: unknown[] }).words
        : null;

  if (!list) {
    throw new Error('JSON 배열 형식이 아닙니다.');
  }

  const rows: ImportRow[] = [];
  for (const item of list as RawLlmRow[]) {
    const term = asString(item?.term);
    if (!term) {
      continue;
    }
    const meaningKo = asString(item?.meaningKo) || asString(item?.meaning) || undefined;
    const fullExpansion = asString(item?.fullExpansion) || asString(item?.full) || undefined;
    rows.push({
      term,
      meaningKo,
      type: asType(item?.type) ?? (fullExpansion ? 'abbr' : undefined),
      fullExpansion,
      domains: normalizeListField(item?.domains as string | string[] | undefined),
      tags: normalizeListField(item?.tags as string | string[] | undefined),
      notes: asString(item?.notes),
      favorite: item?.favorite === true
    });
  }
  return rows;
}

function tryParseJsonish(candidate: string): unknown {
  try {
    return JSON.parse(candidate);
  } catch {
    // fall through to bracket extraction
  }

  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      // try object
    }
  }

  const objStart = candidate.indexOf('{');
  const objEnd = candidate.lastIndexOf('}');
  if (objStart >= 0 && objEnd > objStart) {
    try {
      return JSON.parse(candidate.slice(objStart, objEnd + 1));
    } catch {
      return undefined;
    }
  }

  return undefined;
}
