import type { EntryType, ImportRow, VocabEntry, AbbrExpansion } from '../types';
import { createId } from './id';
import { createStableKey, normalizeListField, normalizeTerm } from './normalize';

function inferType(row: ImportRow): EntryType {
  if (row.type === 'word' || row.type === 'abbr') {
    return row.type;
  }

  if (row.fullExpansion?.trim()) {
    return 'abbr';
  }

  return 'word';
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function createEntry(term: string, type: EntryType, now: number): VocabEntry {
  return {
    stableKey: createStableKey(term, type),
    type,
    term,
    termNorm: normalizeTerm(term),
    meaningKo: undefined,
    tags: [],
    notes: '',
    favorite: false,
    expansions: [],
    createdAt: now,
    updatedAt: now
  };
}

function mergeExpansion(target: AbbrExpansion, row: ImportRow, now: number): AbbrExpansion {
  return {
    ...target,
    meaningKo: row.meaningKo?.trim() || target.meaningKo,
    domains: uniq([...target.domains, ...normalizeListField(row.domains)]),
    tags: uniq([...target.tags, ...normalizeListField(row.tags)]),
    notes: row.notes?.trim() || target.notes,
    favorite: row.favorite ?? target.favorite,
    deletedAt: undefined,
    updatedAt: now
  };
}

export function applyImportRows(existingEntries: VocabEntry[], rows: ImportRow[], now: number = Date.now()): VocabEntry[] {
  const map = new Map<string, VocabEntry>();

  for (const entry of existingEntries) {
    map.set(entry.stableKey, {
      ...entry,
      expansions: entry.expansions.map((expansion) => ({ ...expansion }))
    });
  }

  for (const row of rows) {
    const term = row.term?.trim();
    if (!term) {
      continue;
    }

    const type = inferType(row);
    const stableKey = createStableKey(term, type);

    const current = map.get(stableKey) ?? createEntry(term, type, now);
    current.deletedAt = undefined;
    current.updatedAt = now;

    current.tags = uniq([...current.tags, ...normalizeListField(row.tags)]);
    current.notes = row.notes?.trim() || current.notes;
    current.favorite = row.favorite ?? current.favorite;

    if (type === 'word') {
      if (row.meaningKo?.trim()) {
        current.meaningKo = row.meaningKo.trim();
      }
      map.set(stableKey, current);
      continue;
    }

    if (!row.fullExpansion?.trim()) {
      if (row.meaningKo?.trim()) {
        current.meaningKo = row.meaningKo.trim();
      }
      map.set(stableKey, current);
      continue;
    }

    const expansionNorm = normalizeTerm(row.fullExpansion);
    const existingExpansion = current.expansions.find(
      (expansion) => normalizeTerm(expansion.fullExpansion) === expansionNorm
    );

    if (existingExpansion) {
      Object.assign(existingExpansion, mergeExpansion(existingExpansion, row, now));
    } else {
      current.expansions.push({
        id: createId('exp'),
        fullExpansion: row.fullExpansion.trim(),
        meaningKo: row.meaningKo?.trim() || undefined,
        domains: normalizeListField(row.domains),
        tags: normalizeListField(row.tags),
        notes: row.notes?.trim() ?? '',
        favorite: row.favorite ?? false,
        updatedAt: now
      });
    }

    map.set(stableKey, current);
  }

  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
