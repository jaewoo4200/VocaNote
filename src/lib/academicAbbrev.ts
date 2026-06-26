import type { VocabEntry } from '../types';
import { normalizeTerm } from './normalize';

interface AcademicSeed {
  abbr: string;
  fullExpansion: string;
  meaningKo: string;
  domains: string[];
  note?: string;
  /** Original source page (e.g. a ktword.co.kr explanation URL) for attribution. */
  sourceUrl?: string;
}

export interface AcademicAbbrevSuggestion extends AcademicSeed {
  score: number;
}

const BUILTIN_SEEDS: AcademicSeed[] = [
  { abbr: 'LLM', fullExpansion: 'Large Language Model', meaningKo: '대규모 언어 모델', domains: ['ai', 'nlp'] },
  { abbr: 'NLP', fullExpansion: 'Natural Language Processing', meaningKo: '자연어 처리', domains: ['ai', 'nlp'] },
  { abbr: 'CV', fullExpansion: 'Computer Vision', meaningKo: '컴퓨터 비전', domains: ['ai', 'vision'] },
  { abbr: 'RL', fullExpansion: 'Reinforcement Learning', meaningKo: '강화학습', domains: ['ai', 'ml'] },
  { abbr: 'CNN', fullExpansion: 'Convolutional Neural Network', meaningKo: '합성곱 신경망', domains: ['ai', 'vision'] },
  { abbr: 'RNN', fullExpansion: 'Recurrent Neural Network', meaningKo: '순환 신경망', domains: ['ai', 'nlp'] },
  { abbr: 'GAN', fullExpansion: 'Generative Adversarial Network', meaningKo: '생성적 적대 신경망', domains: ['ai', 'ml'] },
  { abbr: 'VAE', fullExpansion: 'Variational Autoencoder', meaningKo: '변분 오토인코더', domains: ['ai', 'ml'] },
  { abbr: 'SOTA', fullExpansion: 'State Of The Art', meaningKo: '최신 최고 성능', domains: ['research'] },
  { abbr: 'SVM', fullExpansion: 'Support Vector Machine', meaningKo: '서포트 벡터 머신', domains: ['ml', 'statistics'] },
  { abbr: 'PCA', fullExpansion: 'Principal Component Analysis', meaningKo: '주성분 분석', domains: ['statistics', 'ml'] },
  { abbr: 'LDA', fullExpansion: 'Linear Discriminant Analysis', meaningKo: '선형 판별 분석', domains: ['statistics', 'ml'] },
  { abbr: 'SGD', fullExpansion: 'Stochastic Gradient Descent', meaningKo: '확률적 경사 하강법', domains: ['ml', 'optimization'] },
  { abbr: 'MSE', fullExpansion: 'Mean Squared Error', meaningKo: '평균 제곱 오차', domains: ['statistics', 'ml'] },
  { abbr: 'MAE', fullExpansion: 'Mean Absolute Error', meaningKo: '평균 절대 오차', domains: ['statistics', 'ml'] },
  { abbr: 'ROC', fullExpansion: 'Receiver Operating Characteristic', meaningKo: '수신자 조작 특성 곡선', domains: ['statistics', 'biomed'] },
  { abbr: 'AUC', fullExpansion: 'Area Under the Curve', meaningKo: '곡선 하면적', domains: ['statistics', 'biomed'] },
  { abbr: 'ANOVA', fullExpansion: 'Analysis of Variance', meaningKo: '분산 분석', domains: ['statistics'] },
  { abbr: 'CI', fullExpansion: 'Confidence Interval', meaningKo: '신뢰구간', domains: ['statistics', 'biomed'] },
  { abbr: 'RCT', fullExpansion: 'Randomized Controlled Trial', meaningKo: '무작위 대조 시험', domains: ['medicine', 'biomed'] },
  { abbr: 'PCR', fullExpansion: 'Polymerase Chain Reaction', meaningKo: '중합효소 연쇄 반응', domains: ['biology', 'medicine'] },
  { abbr: 'DNA', fullExpansion: 'Deoxyribonucleic Acid', meaningKo: '디옥시리보핵산', domains: ['biology'] },
  { abbr: 'RNA', fullExpansion: 'Ribonucleic Acid', meaningKo: '리보핵산', domains: ['biology'] },
  { abbr: 'GPU', fullExpansion: 'Graphics Processing Unit', meaningKo: '그래픽 처리 장치', domains: ['computer', 'ai'] },
  { abbr: 'TPU', fullExpansion: 'Tensor Processing Unit', meaningKo: '텐서 처리 장치', domains: ['computer', 'ai'] },
  { abbr: 'API', fullExpansion: 'Application Programming Interface', meaningKo: '응용 프로그램 인터페이스', domains: ['computer', 'software'] },
  { abbr: 'OOD', fullExpansion: 'Out Of Distribution', meaningKo: '분포 외 데이터', domains: ['ai', 'ml'] },
  { abbr: 'IRB', fullExpansion: 'Institutional Review Board', meaningKo: '기관생명윤리위원회', domains: ['research', 'medicine'] },
  { abbr: 'DOI', fullExpansion: 'Digital Object Identifier', meaningKo: '디지털 객체 식별자', domains: ['research'] },
  { abbr: 'ETA', fullExpansion: 'Estimated Time of Arrival', meaningKo: '예상 도착 시간', domains: ['engineering'] }
];

// Active seed list = built-in seeds merged with any datasets loaded at runtime
// (public/abbreviations.json, public/ktword.json). Datasets ACCUMULATE so
// loading several does not clobber earlier ones. Kept mutable so data can be
// extended/updated without changing code (see loadAbbrevSeeds).
let extraSeeds: AcademicSeed[] = [];
let abbrevSeeds: AcademicSeed[] = BUILTIN_SEEDS;

interface RawAbbrev {
  abbr?: unknown;
  full?: unknown;
  ko?: unknown;
  domains?: unknown;
  url?: unknown;
}

function seedKey(seed: AcademicSeed): string {
  return `${normalizeTerm(seed.abbr)}::${normalizeTerm(seed.fullExpansion)}`;
}

function rebuildSeeds(): void {
  const byKey = new Map<string, AcademicSeed>();
  // Built-in (curated) seeds first so they win over dataset duplicates.
  for (const seed of [...BUILTIN_SEEDS, ...extraSeeds]) {
    if (!byKey.has(seedKey(seed))) {
      byKey.set(seedKey(seed), seed);
    }
  }
  abbrevSeeds = [...byKey.values()];
}

/** Merge an additional dataset onto the active set (accumulates across calls). */
export function setAbbrevSeeds(extra: AcademicSeed[]): void {
  extraSeeds = [...extraSeeds, ...extra];
  rebuildSeeds();
}

export function parseAbbrevDataset(raw: unknown): AcademicSeed[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: AcademicSeed[] = [];
  for (const row of raw as RawAbbrev[]) {
    const abbr = typeof row?.abbr === 'string' ? row.abbr.trim() : '';
    const fullExpansion = typeof row?.full === 'string' ? row.full.trim() : '';
    const meaningKo = typeof row?.ko === 'string' ? row.ko.trim() : '';
    if (!abbr || !meaningKo) {
      continue;
    }
    const domains = Array.isArray(row?.domains)
      ? row.domains.filter((d): d is string => typeof d === 'string')
      : [];
    const sourceUrl = typeof row?.url === 'string' ? row.url.trim() : undefined;
    out.push({ abbr, fullExpansion: fullExpansion || abbr, meaningKo, domains, sourceUrl });
  }
  return out;
}

/** Fetch and merge the bundled abbreviation dataset. Best-effort. */
export async function loadAbbrevSeeds(url: string): Promise<number> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`abbreviations fetch failed (${response.status})`);
  }
  const parsed = parseAbbrevDataset(await response.json());
  setAbbrevSeeds(parsed);
  return parsed.length;
}

function scoreSeed(seed: AcademicSeed, queryNorm: string, preferredDomains: string[]): number {
  const abbrNorm = normalizeTerm(seed.abbr);
  const fullNorm = normalizeTerm(seed.fullExpansion);
  const meaningNorm = normalizeTerm(seed.meaningKo);

  let score = 0;

  if (abbrNorm === queryNorm) {
    score += 120;
  } else if (abbrNorm.startsWith(queryNorm)) {
    score += 85;
  } else if (abbrNorm.includes(queryNorm)) {
    score += 60;
  }

  if (fullNorm === queryNorm) {
    score += 100;
  } else if (fullNorm.startsWith(queryNorm)) {
    score += 65;
  } else if (fullNorm.includes(queryNorm)) {
    score += 45;
  }

  if (meaningNorm.includes(queryNorm)) {
    score += 30;
  }

  const preferredSet = new Set(preferredDomains.map((domain) => normalizeTerm(domain)));
  score += seed.domains.reduce((acc, domain) => {
    return acc + (preferredSet.has(normalizeTerm(domain)) ? 12 : 0);
  }, 0);

  return score;
}

function hasExistingExpansion(entries: VocabEntry[], seed: AcademicSeed): boolean {
  const abbrNorm = normalizeTerm(seed.abbr);
  const expansionNorm = normalizeTerm(seed.fullExpansion);

  return entries.some((entry) => {
    if (entry.deletedAt || entry.type !== 'abbr' || entry.termNorm !== abbrNorm) {
      return false;
    }

    return entry.expansions.some(
      (expansion) => !expansion.deletedAt && normalizeTerm(expansion.fullExpansion) === expansionNorm
    );
  });
}

export function findAcademicAbbrevSuggestions(
  query: string,
  preferredDomains: string[],
  existingEntries: VocabEntry[]
): AcademicAbbrevSuggestion[] {
  const queryNorm = normalizeTerm(query);
  if (!queryNorm) {
    return [];
  }

  return abbrevSeeds.map((seed) => ({
    ...seed,
    score: scoreSeed(seed, queryNorm, preferredDomains) - (hasExistingExpansion(existingEntries, seed) ? 25 : 0)
  }))
    .filter((seed) => seed.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);
}
