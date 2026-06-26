import type { ReviewItem, SearchResult, VocabEntry, AbbrExpansion } from '../types';
import { normalizeTerm } from './normalize';

export function hasMeaning(entry: VocabEntry): boolean {
  if (entry.deletedAt) {
    return false;
  }

  if (entry.type === 'word') {
    return Boolean(entry.meaningKo?.trim());
  }

  if (entry.meaningKo?.trim()) {
    return true;
  }

  return entry.expansions.some((expansion) => !expansion.deletedAt && Boolean(expansion.meaningKo?.trim()));
}

function scoreText(text: string | undefined, queryNorm: string, exact: number, prefix: number, partial: number): number {
  if (!text) {
    return 0;
  }

  const normalized = normalizeTerm(text);
  if (!normalized) {
    return 0;
  }

  if (normalized === queryNorm) {
    return exact;
  }

  if (normalized.startsWith(queryNorm)) {
    return prefix;
  }

  if (normalized.includes(queryNorm)) {
    return partial;
  }

  return 0;
}

function scoreEntry(entry: VocabEntry, queryNorm: string, preferredDomains: string[]): number {
  let score = scoreText(entry.termNorm, queryNorm, 100, 60, 40);
  score += scoreText(entry.meaningKo, queryNorm, 40, 25, 15);
  score += scoreText(entry.notes, queryNorm, 20, 12, 8);

  const normalizedTags = entry.tags.map((tag) => normalizeTerm(tag));
  if (normalizedTags.some((tag) => tag === queryNorm)) {
    score += 25;
  } else if (normalizedTags.some((tag) => tag.includes(queryNorm))) {
    score += 10;
  }

  if (entry.type === 'abbr') {
    const preferredSet = new Set(preferredDomains.map((domain) => normalizeTerm(domain)));

    for (const expansion of entry.expansions) {
      if (expansion.deletedAt) {
        continue;
      }

      score += scoreText(expansion.fullExpansion, queryNorm, 95, 55, 35);
      score += scoreText(expansion.meaningKo, queryNorm, 35, 20, 12);
      score += scoreText(expansion.notes, queryNorm, 18, 10, 6);

      const expansionTags = expansion.tags.map((tag) => normalizeTerm(tag));
      if (expansionTags.some((tag) => tag === queryNorm)) {
        score += 18;
      } else if (expansionTags.some((tag) => tag.includes(queryNorm))) {
        score += 8;
      }

      const domainBonus = expansion.domains.reduce((acc, domain) => {
        return acc + (preferredSet.has(normalizeTerm(domain)) ? 5 : 0);
      }, 0);
      score += domainBonus;
    }
  }

  return score;
}

/**
 * The single-line meaning shown for an entry in previews, detail panels, and
 * autocomplete. For abbreviations it falls back to the highest-ranked expansion
 * that actually has a meaning. Returns '뜻 미정의' when nothing is defined.
 */
export function buildMeaningPreview(entry: VocabEntry, preferredDomains: string[]): string {
  if (entry.type === 'word') {
    return entry.meaningKo?.trim() || '뜻 미정의';
  }

  if (entry.meaningKo?.trim()) {
    return entry.meaningKo;
  }

  const first = rankAbbrExpansions(entry, preferredDomains).find((expansion) =>
    Boolean(expansion.meaningKo?.trim())
  );
  return first?.meaningKo?.trim() || '뜻 미정의';
}

export function rankAbbrExpansions(entry: VocabEntry, preferredDomains: string[]): AbbrExpansion[] {
  if (entry.type !== 'abbr') {
    return [];
  }

  const domainSet = new Set(preferredDomains.map((domain) => normalizeTerm(domain)));

  return [...entry.expansions]
    .filter((expansion) => !expansion.deletedAt)
    .sort((left, right) => {
      const leftPinned = entry.priorityExpansionId === left.id ? 1 : 0;
      const rightPinned = entry.priorityExpansionId === right.id ? 1 : 0;

      if (leftPinned !== rightPinned) {
        return rightPinned - leftPinned;
      }

      const leftDomainScore = left.domains.reduce((acc, domain) => {
        return acc + (domainSet.has(normalizeTerm(domain)) ? 1 : 0);
      }, 0);
      const rightDomainScore = right.domains.reduce((acc, domain) => {
        return acc + (domainSet.has(normalizeTerm(domain)) ? 1 : 0);
      }, 0);

      if (leftDomainScore !== rightDomainScore) {
        return rightDomainScore - leftDomainScore;
      }

      return right.updatedAt - left.updatedAt;
    });
}

export function searchEntries(entries: VocabEntry[], query: string, preferredDomains: string[]): SearchResult[] {
  const queryNorm = normalizeTerm(query);

  if (!queryNorm) {
    return [];
  }

  const results = entries
    .filter((entry) => !entry.deletedAt)
    .map((entry): SearchResult => ({
      entry,
      score: scoreEntry(entry, queryNorm, preferredDomains),
      hasMeaning: hasMeaning(entry)
    }))
    .filter((result) => result.score > 0)
    .sort((left, right) => {
      if (left.hasMeaning !== right.hasMeaning) {
        return left.hasMeaning ? -1 : 1;
      }

      if (left.entry.type !== right.entry.type) {
        return left.entry.type === 'word' ? -1 : 1;
      }

      if (left.score !== right.score) {
        return right.score - left.score;
      }

      if (left.entry.type === 'abbr' && right.entry.type === 'abbr') {
        const leftTop = rankAbbrExpansions(left.entry, preferredDomains)[0];
        const rightTop = rankAbbrExpansions(right.entry, preferredDomains)[0];
        const leftTime = leftTop?.updatedAt ?? 0;
        const rightTime = rightTop?.updatedAt ?? 0;
        if (leftTime !== rightTime) {
          return rightTime - leftTime;
        }
      }

      return right.entry.updatedAt - left.entry.updatedAt;
    });

  return results;
}

export function toReviewQueue(entries: VocabEntry[]): ReviewItem[] {
  const items: ReviewItem[] = [];

  for (const entry of entries) {
    if (entry.deletedAt) {
      continue;
    }

    if (entry.type === 'word') {
      if (!entry.meaningKo?.trim()) {
        items.push({
          stableKey: entry.stableKey,
          term: entry.term,
          type: 'word',
          label: entry.term
        });
      }
      continue;
    }

    if (entry.meaningKo?.trim()) {
      continue;
    }

    const aliveExpansions = entry.expansions.filter((expansion) => !expansion.deletedAt);
    if (aliveExpansions.length === 0) {
      items.push({
        stableKey: entry.stableKey,
        term: entry.term,
        type: 'abbr',
        label: entry.term
      });
      continue;
    }

    for (const expansion of aliveExpansions) {
      if (expansion.meaningKo?.trim()) {
        continue;
      }

      items.push({
        stableKey: entry.stableKey,
        term: entry.term,
        type: 'abbr',
        expansionId: expansion.id,
        label: `${entry.term} - ${expansion.fullExpansion}`
      });
    }
  }

  return items.sort((left, right) => left.term.localeCompare(right.term));
}
