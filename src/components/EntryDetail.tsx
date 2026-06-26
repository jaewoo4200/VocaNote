import { buildMeaningPreview, rankAbbrExpansions } from '../lib/search';
import type { VocabEntry } from '../types';

interface EntryDetailProps {
  entry: VocabEntry;
  preferredDomains: string[];
  onClose: () => void;
  onEdit: (entry: VocabEntry) => void;
  onLookup: (mode: 'dictionary' | 'search', term: string) => void;
  onDelete: (entry: VocabEntry) => void;
}

/**
 * Detail view for a selected entry. Shared verbatim by the desktop right-hand
 * panel and the mobile bottom sheet so both surfaces expose the same actions
 * (edit / dictionary lookup / search lookup / delete) and content.
 */
export function EntryDetail({
  entry,
  preferredDomains,
  onClose,
  onEdit,
  onLookup,
  onDelete
}: EntryDetailProps): JSX.Element {
  const expansions = entry.type === 'abbr' ? rankAbbrExpansions(entry, preferredDomains) : [];

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold">{entry.term}</h3>
          <span className="chip mt-1">{entry.type === 'abbr' ? '약어' : '단어'}</span>
        </div>
        <button type="button" onClick={onClose} className="btn btn-ghost shrink-0 text-xs">
          닫기
        </button>
      </div>

      <p className="text-sm leading-relaxed">{buildMeaningPreview(entry, preferredDomains)}</p>

      {entry.notes?.trim() ? (
        <p className="whitespace-pre-wrap rounded-lg bg-[color:var(--surface-soft)] p-2.5 text-xs text-[color:var(--text-muted)]">
          {entry.notes}
        </p>
      ) : null}

      {entry.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {entry.tags.map((tag) => (
            <span key={tag} className="chip">
              #{tag}
            </span>
          ))}
        </div>
      ) : null}

      {expansions.length > 0 ? (
        <div className="space-y-2">
          {expansions.map((expansion) => (
            <div key={expansion.id} className="rounded-xl border border-[color:var(--border)] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{expansion.fullExpansion}</p>
                {entry.priorityExpansionId === expansion.id ? (
                  <span className="chip chip-brand shrink-0">기본</span>
                ) : null}
              </div>
              <p className="mt-0.5 text-sm text-[color:var(--text-muted)]">
                {expansion.meaningKo?.trim() || '뜻 미정의'}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" className="btn btn-primary" onClick={() => onEdit(entry)}>
          뜻 수정
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onLookup('dictionary', entry.term)}
        >
          사전 조회
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onLookup('search', entry.term)}
        >
          검색 조회
        </button>
        <button
          type="button"
          className="btn btn-ghost text-[color:var(--danger)]"
          onClick={() => onDelete(entry)}
        >
          삭제
        </button>
      </div>
    </div>
  );
}
