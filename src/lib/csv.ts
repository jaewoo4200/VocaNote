import Papa from 'papaparse';
import type { ImportRow, VocabEntry } from '../types';
import { parseBoolean, normalizeCsvHeader, normalizeListField, normalizeTerm } from './normalize';

const HEADER_MAP: Record<string, keyof ImportRow> = {
  term: 'term',
  meaningko: 'meaningKo',
  type: 'type',
  fullexpansion: 'fullExpansion',
  domains: 'domains',
  tags: 'tags',
  notes: 'notes',
  favorite: 'favorite'
};

export interface ImportParseResult {
  rows: ImportRow[];
  mode: 'csv' | 'text';
  warnings: string[];
}

function toStringValue(input: unknown): string {
  if (input == null) {
    return '';
  }

  return String(input).trim();
}

function parseType(rawType: string): ImportRow['type'] {
  const normalized = normalizeTerm(rawType);
  if (normalized === 'word' || normalized === 'abbr') {
    return normalized;
  }

  return undefined;
}

function parseCsv(raw: string): ImportParseResult {
  const parsed = Papa.parse<Record<string, unknown>>(raw, {
    header: true,
    skipEmptyLines: true
  });

  const warnings: string[] = [];
  const rows: ImportRow[] = [];

  if (parsed.errors.length > 0) {
    for (const error of parsed.errors) {
      warnings.push(`CSV parse warning: ${error.message}`);
    }
  }

  for (const item of parsed.data) {
    const canonical: Partial<Record<keyof ImportRow, unknown>> = {};

    for (const [rawKey, rawValue] of Object.entries(item)) {
      const key = HEADER_MAP[normalizeCsvHeader(rawKey)];
      if (!key) {
        continue;
      }
      canonical[key] = rawValue;
    }

    const term = toStringValue(canonical.term);
    if (!term) {
      continue;
    }

    const type = parseType(toStringValue(canonical.type));
    rows.push({
      term,
      meaningKo: toStringValue(canonical.meaningKo) || undefined,
      type,
      fullExpansion: toStringValue(canonical.fullExpansion) || undefined,
      domains: normalizeListField(canonical.domains as string | undefined),
      tags: normalizeListField(canonical.tags as string | undefined),
      notes: toStringValue(canonical.notes),
      favorite: parseBoolean(canonical.favorite as string | boolean | undefined)
    });
  }

  return { rows, mode: 'csv', warnings };
}

function parsePlainText(raw: string): ImportParseResult {
  const terms = Array.from(
    new Set(
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    )
  );

  return {
    rows: terms.map((term) => ({ term, type: 'word' })),
    mode: 'text',
    warnings: []
  };
}

function looksLikeCsv(raw: string): boolean {
  const firstLine = raw.split(/\r?\n/, 1)[0] ?? '';
  if (!firstLine.includes(',')) {
    return false;
  }

  const normalizedHeaders = firstLine
    .split(',')
    .map((header) => normalizeCsvHeader(header))
    .filter(Boolean);

  return normalizedHeaders.some((header) => header in HEADER_MAP);
}

export function parseImportInput(raw: string, mode: 'auto' | 'csv' | 'text' = 'auto'): ImportParseResult {
  if (mode === 'csv') {
    return parseCsv(raw);
  }

  if (mode === 'text') {
    return parsePlainText(raw);
  }

  return looksLikeCsv(raw) ? parseCsv(raw) : parsePlainText(raw);
}

export function entriesToWordCsv(entries: VocabEntry[]): string {
  const rows = entries
    .filter((entry) => !entry.deletedAt && entry.type === 'word')
    .map((entry) => ({
      term: entry.term,
      meaningKo: entry.meaningKo ?? '',
      type: 'word',
      fullExpansion: '',
      domains: '',
      tags: entry.tags.join('|'),
      notes: entry.notes,
      favorite: entry.favorite ? 'true' : 'false'
    }));

  return Papa.unparse(rows);
}

export function entriesToAbbrCsv(entries: VocabEntry[]): string {
  const rows = entries
    .filter((entry) => !entry.deletedAt && entry.type === 'abbr')
    .flatMap((entry) => {
      if (entry.expansions.length === 0) {
        return [
          {
            term: entry.term,
            meaningKo: entry.meaningKo ?? '',
            type: 'abbr',
            fullExpansion: '',
            domains: '',
            tags: entry.tags.join('|'),
            notes: entry.notes,
            favorite: entry.favorite ? 'true' : 'false'
          }
        ];
      }

      return entry.expansions
        .filter((expansion) => !expansion.deletedAt)
        .map((expansion) => ({
          term: entry.term,
          meaningKo: expansion.meaningKo ?? entry.meaningKo ?? '',
          type: 'abbr',
          fullExpansion: expansion.fullExpansion,
          domains: expansion.domains.join('|'),
          tags: Array.from(new Set([...entry.tags, ...expansion.tags])).join('|'),
          notes: expansion.notes || entry.notes,
          favorite: expansion.favorite || entry.favorite ? 'true' : 'false'
        }));
    });

  return Papa.unparse(rows);
}
