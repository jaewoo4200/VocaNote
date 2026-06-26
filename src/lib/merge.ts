import { HISTORY_LIMIT } from '../constants';
import type { AbbrExpansion, BackupPayload, HistoryRecord, VocabEntry } from '../types';

function entityClock(updatedAt: number, deletedAt?: number): number {
  return Math.max(updatedAt, deletedAt ?? 0);
}

function stickyDeletedAt(left?: number, right?: number): number | undefined {
  return Math.max(left ?? 0, right ?? 0) || undefined;
}

function mergeExpansion(left: AbbrExpansion, right: AbbrExpansion): AbbrExpansion {
  const leftClock = entityClock(left.updatedAt, left.deletedAt);
  const rightClock = entityClock(right.updatedAt, right.deletedAt);
  const winner = rightClock > leftClock ? right : left;
  const loser = winner === left ? right : left;

  // Deletion is sticky: if either side has a tombstone, the merged record stays
  // deleted. This prevents an edit on one device from silently resurrecting an
  // expansion that another device deleted (LWW would otherwise undelete it).
  const deletedAt = stickyDeletedAt(left.deletedAt, right.deletedAt);

  return {
    ...winner,
    domains: Array.from(new Set([...winner.domains, ...loser.domains])),
    tags: Array.from(new Set([...winner.tags, ...loser.tags])),
    deletedAt,
    updatedAt: Math.max(left.updatedAt, right.updatedAt, deletedAt ?? 0)
  };
}

function mergeExpansions(left: AbbrExpansion[], right: AbbrExpansion[]): AbbrExpansion[] {
  const map = new Map<string, AbbrExpansion>();

  for (const expansion of left) {
    map.set(expansion.id, expansion);
  }

  for (const expansion of right) {
    const existing = map.get(expansion.id);
    if (!existing) {
      map.set(expansion.id, expansion);
      continue;
    }

    map.set(expansion.id, mergeExpansion(existing, expansion));
  }

  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

function mergeEntry(left: VocabEntry, right: VocabEntry): VocabEntry {
  const leftClock = entityClock(left.updatedAt, left.deletedAt);
  const rightClock = entityClock(right.updatedAt, right.deletedAt);

  const winner = rightClock > leftClock ? right : left;
  const loser = winner === left ? right : left;

  // Sticky deletion (see mergeExpansion): a tombstone on either side wins so a
  // stale edit can't undelete an entry another device removed.
  const deletedAt = stickyDeletedAt(left.deletedAt, right.deletedAt);

  const merged: VocabEntry = {
    ...winner,
    tags: Array.from(new Set([...winner.tags, ...loser.tags])),
    expansions: mergeExpansions(left.expansions, right.expansions),
    createdAt: Math.min(left.createdAt, right.createdAt),
    deletedAt,
    updatedAt: Math.max(left.updatedAt, right.updatedAt, deletedAt ?? 0)
  };

  if (!merged.priorityExpansionId) {
    merged.priorityExpansionId = loser.priorityExpansionId;
  }

  return merged;
}

export function mergeEntries(left: VocabEntry[], right: VocabEntry[]): VocabEntry[] {
  const map = new Map<string, VocabEntry>();

  for (const entry of left) {
    map.set(entry.stableKey, entry);
  }

  for (const entry of right) {
    const existing = map.get(entry.stableKey);
    if (!existing) {
      map.set(entry.stableKey, entry);
      continue;
    }

    map.set(entry.stableKey, mergeEntry(existing, entry));
  }

  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function mergeHistory(left: HistoryRecord[], right: HistoryRecord[]): HistoryRecord[] {
  const map = new Map<string, HistoryRecord>();

  for (const item of left) {
    map.set(item.termNorm, item);
  }

  for (const item of right) {
    const existing = map.get(item.termNorm);
    if (!existing) {
      map.set(item.termNorm, item);
      continue;
    }

    map.set(item.termNorm, {
      termNorm: existing.termNorm,
      term: item.lastSeenAt >= existing.lastSeenAt ? item.term : existing.term,
      lastSeenAt: Math.max(existing.lastSeenAt, item.lastSeenAt),
      seenCount: Math.max(existing.seenCount, item.seenCount)
    });
  }

  return pruneHistory([...map.values()], HISTORY_LIMIT);
}

export function pruneHistory(history: HistoryRecord[], maxSize: number = HISTORY_LIMIT): HistoryRecord[] {
  return [...history]
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, maxSize);
}

export function mergeBackup(local: BackupPayload, remote: BackupPayload): BackupPayload {
  return {
    schemaVersion: Math.max(local.schemaVersion, remote.schemaVersion),
    exportedAt: new Date().toISOString(),
    entries: mergeEntries(local.entries, remote.entries),
    history: mergeHistory(local.history, remote.history)
  };
}
