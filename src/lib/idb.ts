import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { BACKUP_SCHEMA_VERSION, HISTORY_LIMIT } from '../constants';
import type { BackupPayload, EntryType, HistoryRecord, VocabEntry } from '../types';
import { pruneHistory } from './merge';

interface MetaRecord {
  key: string;
  value: string;
}

interface VocaDb extends DBSchema {
  entries: {
    key: string;
    value: VocabEntry;
    indexes: {
      'by-type': EntryType;
      'by-term': string;
      'by-updatedAt': number;
    };
  };
  history: {
    key: string;
    value: HistoryRecord;
    indexes: {
      'by-lastSeenAt': number;
      'by-seenCount': number;
    };
  };
  meta: {
    key: string;
    value: MetaRecord;
  };
}

const DB_NAME = 'voca-note-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<VocaDb>> | undefined;

function getDb(): Promise<IDBPDatabase<VocaDb>> {
  if (!dbPromise) {
    dbPromise = openDB<VocaDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const entriesStore = db.createObjectStore('entries', { keyPath: 'stableKey' });
        entriesStore.createIndex('by-type', 'type');
        entriesStore.createIndex('by-term', 'termNorm');
        entriesStore.createIndex('by-updatedAt', 'updatedAt');

        const historyStore = db.createObjectStore('history', { keyPath: 'termNorm' });
        historyStore.createIndex('by-lastSeenAt', 'lastSeenAt');
        historyStore.createIndex('by-seenCount', 'seenCount');

        db.createObjectStore('meta', { keyPath: 'key' });
      }
    });
  }

  return dbPromise;
}

function normalizeEntry(entry: VocabEntry): VocabEntry {
  return {
    ...entry,
    tags: entry.tags ?? [],
    notes: entry.notes ?? '',
    // favorite 도 기본값 처리 — 없으면 JSON.stringify 가 키를 생략해 네이티브(macOS)
    // 클라이언트의 디코딩이 깨질 수 있다(레거시/복원 레코드 방어).
    favorite: entry.favorite ?? false,
    expansions: (entry.expansions ?? []).map((expansion) => ({
      ...expansion,
      domains: expansion.domains ?? [],
      tags: expansion.tags ?? [],
      notes: expansion.notes ?? '',
      favorite: expansion.favorite ?? false
    }))
  };
}

export async function getEntries(includeDeleted: boolean = true): Promise<VocabEntry[]> {
  const db = await getDb();
  const all = await db.getAll('entries');
  const normalized = all.map(normalizeEntry);

  if (includeDeleted) {
    return normalized.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  return normalized.filter((entry) => !entry.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getEntry(stableKey: string): Promise<VocabEntry | undefined> {
  const db = await getDb();
  const item = await db.get('entries', stableKey);
  return item ? normalizeEntry(item) : undefined;
}

export async function putEntry(entry: VocabEntry): Promise<void> {
  const db = await getDb();
  await db.put('entries', normalizeEntry(entry));
}

export async function putEntries(entries: VocabEntry[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('entries', 'readwrite');

  for (const entry of entries) {
    await tx.store.put(normalizeEntry(entry));
  }

  await tx.done;
}

export async function tombstoneEntry(stableKey: string, deletedAt: number = Date.now()): Promise<void> {
  const entry = await getEntry(stableKey);
  if (!entry) {
    return;
  }

  await putEntry({
    ...entry,
    deletedAt,
    updatedAt: Math.max(entry.updatedAt, deletedAt)
  });
}

export async function getHistory(limit: number = HISTORY_LIMIT): Promise<HistoryRecord[]> {
  const db = await getDb();
  const all = await db.getAll('history');
  return pruneHistory(all, limit);
}

export async function putHistory(records: HistoryRecord[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('history', 'readwrite');
  for (const record of pruneHistory(records, HISTORY_LIMIT)) {
    await tx.store.put(record);
  }

  const keys = await tx.store.getAllKeys();
  if (keys.length > HISTORY_LIMIT) {
    const all = await tx.store.getAll();
    const keepSet = new Set(pruneHistory(all, HISTORY_LIMIT).map((item) => item.termNorm));
    for (const key of keys) {
      if (!keepSet.has(String(key))) {
        await tx.store.delete(key as string);
      }
    }
  }

  await tx.done;
}

export async function recordHistory(termNorm: string, term: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get('history', termNorm);

  const next: HistoryRecord = existing
    ? {
        ...existing,
        term,
        lastSeenAt: Date.now(),
        seenCount: existing.seenCount + 1
      }
    : {
        termNorm,
        term,
        lastSeenAt: Date.now(),
        seenCount: 1
      };

  await db.put('history', next);

  const all = await db.getAll('history');
  if (all.length <= HISTORY_LIMIT) {
    return;
  }

  const keepSet = new Set(pruneHistory(all, HISTORY_LIMIT).map((item) => item.termNorm));
  const tx = db.transaction('history', 'readwrite');
  for (const item of all) {
    if (!keepSet.has(item.termNorm)) {
      await tx.store.delete(item.termNorm);
    }
  }
  await tx.done;
}

export async function exportBackupPayload(): Promise<BackupPayload> {
  const [entries, history] = await Promise.all([getEntries(true), getHistory(HISTORY_LIMIT)]);

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    entries,
    history
  };
}

export async function restoreBackupPayload(payload: BackupPayload): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['entries', 'history'], 'readwrite');
  await tx.objectStore('entries').clear();
  await tx.objectStore('history').clear();

  for (const entry of payload.entries.map(normalizeEntry)) {
    await tx.objectStore('entries').put(entry);
  }

  for (const item of pruneHistory(payload.history, HISTORY_LIMIT)) {
    await tx.objectStore('history').put(item);
  }

  await tx.done;
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['entries', 'history', 'meta'], 'readwrite');
  await tx.objectStore('entries').clear();
  await tx.objectStore('history').clear();
  await tx.objectStore('meta').clear();
  await tx.done;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.put('meta', { key, value });
}

export async function getMeta(key: string): Promise<string | undefined> {
  const db = await getDb();
  const record = await db.get('meta', key);
  return record?.value;
}
