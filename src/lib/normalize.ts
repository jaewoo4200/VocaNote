import type { EntryType } from '../types';

export function normalizeTerm(input: string): string {
  return input
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeCsvHeader(input: string): string {
  return normalizeTerm(input).replace(/[\s_-]+/g, '');
}

export function normalizeListField(raw: string | string[] | undefined): string[] {
  if (!raw) {
    return [];
  }

  const source = Array.isArray(raw) ? raw.join(',') : raw;

  return Array.from(
    new Set(
      source
        .split(/[|,;\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

export function createStableKey(term: string, type: EntryType): string {
  return `${normalizeTerm(term)}::${type}`;
}

export function parseBoolean(input: string | boolean | undefined): boolean {
  if (typeof input === 'boolean') {
    return input;
  }

  if (!input) {
    return false;
  }

  return ['1', 'true', 'y', 'yes'].includes(normalizeTerm(input));
}
