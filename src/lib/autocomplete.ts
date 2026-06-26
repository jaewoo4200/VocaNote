import { normalizeTerm } from './normalize';
import { buildMeaningPreview } from './search';
import type { Suggestion } from './suggest';
import type { VocabEntry } from '../types';

export interface AutocompleteSuggestion {
  term: string;
  meaningKo?: string;
  subtitle: string;
  source: 'entry' | 'daum' | 'naver' | 'dictionary';
}

function toMeaningSnippet(value: string | undefined): string | undefined {
  const text = value?.replace(/\s+/g, ' ').trim();
  if (!text || text === '뜻 미정의') {
    return undefined;
  }
  return text.length <= 120 ? text : `${text.slice(0, 117)}...`;
}

interface BuildOptions {
  query: string;
  entries: VocabEntry[];
  preferredDomains: string[];
  /** Live Daum/Naver suggest results (word + Korean meaning). May be empty while loading. */
  liveSuggestions?: Suggestion[];
  /** Which engine produced liveSuggestions (controls the row label/chip). */
  liveEngine?: 'daum' | 'naver';
  /** Offline frequency-ranked dictionary words (from queryWordlist). */
  dictionaryMatches?: string[];
  limit?: number;
}

/**
 * Build the autocomplete list shown under the search box, merging three sources
 * in priority order:
 *   1. the user's own wordbook/abbrev entries (their saved meanings)
 *   2. live Daum dictionary/search suggestions (real inline Korean meanings)
 *   3. offline frequency-ranked dictionary words (instant fallback / filler)
 *
 * Sources 1 + 3 are local and resolve instantly; source 2 streams in a moment
 * later and is merged here. Everything is de-duplicated by normalized term, so a
 * word that exists in several sources keeps its richest (earliest) entry.
 */
export function buildAutocompleteSuggestions(options: BuildOptions): AutocompleteSuggestion[] {
  const {
    query,
    entries,
    preferredDomains,
    liveSuggestions = [],
    liveEngine = 'daum',
    dictionaryMatches = [],
    limit = 10
  } = options;

  const queryNorm = normalizeTerm(query);
  if (!queryNorm) {
    return [];
  }

  const seen = new Set<string>();
  const out: AutocompleteSuggestion[] = [];

  const pushUnique = (suggestion: AutocompleteSuggestion): boolean => {
    const norm = normalizeTerm(suggestion.term);
    if (!norm || seen.has(norm) || !norm.startsWith(queryNorm)) {
      return false;
    }
    seen.add(norm);
    out.push(suggestion);
    return out.length >= limit;
  };

  const entryMatches = entries
    .filter((entry) => !entry.deletedAt && entry.termNorm.startsWith(queryNorm))
    .sort((left, right) => {
      const leftHas = buildMeaningPreview(left, preferredDomains) !== '뜻 미정의';
      const rightHas = buildMeaningPreview(right, preferredDomains) !== '뜻 미정의';
      if (leftHas !== rightHas) {
        return leftHas ? -1 : 1;
      }
      if (left.termNorm.length !== right.termNorm.length) {
        return left.termNorm.length - right.termNorm.length;
      }
      return right.updatedAt - left.updatedAt;
    });

  for (const entry of entryMatches) {
    if (
      pushUnique({
        term: entry.term,
        meaningKo: toMeaningSnippet(buildMeaningPreview(entry, preferredDomains)),
        subtitle: entry.type === 'abbr' ? '내 약어장' : '내 단어장',
        source: 'entry'
      })
    ) {
      return out;
    }
  }

  const liveLabel = liveEngine === 'naver' ? '네이버 사전' : '다음 사전';
  for (const item of liveSuggestions) {
    if (
      pushUnique({
        term: item.term,
        meaningKo: toMeaningSnippet(item.meaningKo),
        subtitle: liveLabel,
        source: liveEngine
      })
    ) {
      return out;
    }
  }

  for (const word of dictionaryMatches) {
    if (pushUnique({ term: word, subtitle: '영어 사전', source: 'dictionary' })) {
      break;
    }
  }

  return out;
}
