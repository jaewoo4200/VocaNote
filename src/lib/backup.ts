import { BACKUP_SCHEMA_VERSION } from '../constants';
import type { BackupPayload, HistoryRecord, VocabEntry } from '../types';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVocabEntry(value: unknown): value is VocabEntry {
  if (!isObject(value)) {
    return false;
  }
  return (
    typeof value.stableKey === 'string' &&
    typeof value.term === 'string' &&
    (value.type === 'word' || value.type === 'abbr')
  );
}

function isHistoryRecord(value: unknown): value is HistoryRecord {
  return isObject(value) && typeof value.termNorm === 'string' && typeof value.term === 'string';
}

/**
 * Validate an untrusted parsed JSON object before it is written into the local
 * store. This guards the restore path: `restoreBackupPayload` clears the DB
 * before repopulating, so feeding it a malformed file would otherwise wipe the
 * user's data. We require recognizable `entries`/`history` arrays and reject
 * anything whose items don't look like our records.
 */
export function validateBackupPayload(raw: unknown): BackupPayload {
  if (!isObject(raw)) {
    throw new Error('백업 파일 형식이 올바르지 않습니다 (객체가 아님).');
  }

  if (!Array.isArray(raw.entries) || !Array.isArray(raw.history)) {
    throw new Error('백업 파일에 entries/history 배열이 없습니다.');
  }

  if (raw.entries.length > 0 && !raw.entries.every(isVocabEntry)) {
    throw new Error('백업 파일의 entries 항목 형식이 올바르지 않습니다.');
  }

  if (raw.history.length > 0 && !raw.history.every(isHistoryRecord)) {
    throw new Error('백업 파일의 history 항목 형식이 올바르지 않습니다.');
  }

  const schemaVersion =
    typeof raw.schemaVersion === 'number' ? raw.schemaVersion : BACKUP_SCHEMA_VERSION;
  const exportedAt = typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString();

  return {
    schemaVersion,
    exportedAt,
    entries: raw.entries as VocabEntry[],
    history: raw.history as HistoryRecord[]
  };
}
