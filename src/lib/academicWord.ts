import type { VocabEntry } from '../types';
import { normalizeTerm } from './normalize';

interface AcademicWordSeed {
  term: string;
  meaningKo: string;
  domains: string[];
  note?: string;
}

export interface AcademicWordSuggestion extends AcademicWordSeed {
  score: number;
}

const ACADEMIC_WORD_SEEDS: AcademicWordSeed[] = [
  { term: 'resilience', meaningKo: '회복탄력성, 복원력', domains: ['psychology', 'engineering'] },
  { term: 'robustness', meaningKo: '강건성, 견고성', domains: ['ai', 'statistics'] },
  { term: 'generalization', meaningKo: '일반화', domains: ['ai', 'statistics'] },
  { term: 'inference', meaningKo: '추론', domains: ['statistics', 'ai'] },
  { term: 'hypothesis', meaningKo: '가설', domains: ['research', 'statistics'] },
  { term: 'methodology', meaningKo: '방법론', domains: ['research'] },
  { term: 'paradigm', meaningKo: '패러다임, 이론적 틀', domains: ['research'] },
  { term: 'empirical', meaningKo: '실증적인', domains: ['research', 'statistics'] },
  { term: 'benchmark', meaningKo: '벤치마크, 기준 지표', domains: ['ai', 'engineering'] },
  { term: 'throughput', meaningKo: '처리량', domains: ['engineering', 'computer'] },
  { term: 'latency', meaningKo: '지연시간', domains: ['engineering', 'computer'] },
  { term: 'scalability', meaningKo: '확장성', domains: ['computer', 'engineering'] },
  { term: 'variance', meaningKo: '분산', domains: ['statistics'] },
  { term: 'bias', meaningKo: '편향', domains: ['statistics', 'ai'] },
  { term: 'significance', meaningKo: '통계적 유의성', domains: ['statistics', 'research'] },
  { term: 'validation', meaningKo: '검증', domains: ['research', 'ai'] },
  { term: 'reproducibility', meaningKo: '재현성', domains: ['research'] },
  { term: 'consensus', meaningKo: '합의, 공통된 의견', domains: ['research', 'social'] },
  { term: 'affiliation', meaningKo: '소속 기관', domains: ['research'] },
  { term: 'gradient', meaningKo: '기울기, 그래디언트', domains: ['math', 'ai'] },
  { term: 'convergence', meaningKo: '수렴', domains: ['math', 'optimization'] },
  { term: 'objective', meaningKo: '목적함수, 목표', domains: ['optimization', 'research'] }
];

function scoreSeed(seed: AcademicWordSeed, queryNorm: string, preferredDomains: string[]): number {
  const termNorm = normalizeTerm(seed.term);
  const meaningNorm = normalizeTerm(seed.meaningKo);

  let score = 0;

  if (termNorm === queryNorm) {
    score += 120;
  } else if (termNorm.startsWith(queryNorm)) {
    score += 80;
  } else if (termNorm.includes(queryNorm)) {
    score += 50;
  }

  if (meaningNorm.includes(queryNorm)) {
    score += 30;
  }

  const preferredSet = new Set(preferredDomains.map((domain) => normalizeTerm(domain)));
  score += seed.domains.reduce((acc, domain) => {
    return acc + (preferredSet.has(normalizeTerm(domain)) ? 10 : 0);
  }, 0);

  return score;
}

function hasExistingWord(entries: VocabEntry[], seed: AcademicWordSeed): boolean {
  const termNorm = normalizeTerm(seed.term);

  return entries.some((entry) => {
    if (entry.deletedAt || entry.type !== 'word') {
      return false;
    }

    return entry.termNorm === termNorm;
  });
}

export function findAcademicWordSuggestions(
  query: string,
  preferredDomains: string[],
  existingEntries: VocabEntry[]
): AcademicWordSuggestion[] {
  const queryNorm = normalizeTerm(query);
  if (!queryNorm) {
    return [];
  }

  return ACADEMIC_WORD_SEEDS.map((seed) => ({
    ...seed,
    score: scoreSeed(seed, queryNorm, preferredDomains) - (hasExistingWord(existingEntries, seed) ? 20 : 0)
  }))
    .filter((seed) => seed.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);
}
