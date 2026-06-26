export type EntryType = 'word' | 'abbr';

export type PanelKey = 'history' | 'wordbook' | 'abbrev' | 'review' | 'settings';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AbbrExpansion {
  id: string;
  fullExpansion: string;
  meaningKo?: string;
  domains: string[];
  tags: string[];
  notes: string;
  favorite: boolean;
  updatedAt: number;
  deletedAt?: number;
}

export interface VocabEntry {
  stableKey: string;
  type: EntryType;
  term: string;
  termNorm: string;
  meaningKo?: string;
  tags: string[];
  notes: string;
  favorite: boolean;
  expansions: AbbrExpansion[];
  priorityExpansionId?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface HistoryRecord {
  termNorm: string;
  term: string;
  lastSeenAt: number;
  seenCount: number;
}

export interface SearchProvider {
  id: string;
  name: string;
  template: string;
  kind: 'dictionary' | 'search';
  enabled: boolean;
}

export interface ShortcutMap {
  focusSearch: string;
  close: string;
  help: string;
  goHistory: string;
  goWordbook: string;
  goAbbrev: string;
  goReview: string;
  goSettings: string;
}

export interface SyncSettings {
  mode: 'local' | 'gist' | 'supabase';
  gistId: string;
  rememberToken: boolean;
  supabase: SupabaseSyncConfig;
}

export interface SupabaseSyncConfig {
  url: string;
  anonKey: string;
  email: string;
  rememberSession: boolean;
}

export interface SupabaseUser {
  id: string;
  email?: string;
}

export interface SupabaseSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
  user: SupabaseUser;
}

export interface AppSettings {
  theme: ThemeMode;
  providers: SearchProvider[];
  dictionaryProviderId: string;
  searchProviderId: string;
  autocompleteSource: 'dictionary' | 'search';
  dictionaryLang: string;
  domains: string[];
  shortcuts: ShortcutMap;
  sync: SyncSettings;
}

export interface BackupPayload {
  schemaVersion: number;
  exportedAt: string;
  entries: VocabEntry[];
  history: HistoryRecord[];
}

export interface ImportRow {
  term: string;
  meaningKo?: string;
  type?: EntryType;
  fullExpansion?: string;
  domains?: string[];
  tags?: string[];
  notes?: string;
  favorite?: boolean;
}

export interface ReviewItem {
  stableKey: string;
  term: string;
  type: EntryType;
  expansionId?: string;
  label: string;
}

export interface SearchResult {
  entry: VocabEntry;
  score: number;
  hasMeaning: boolean;
}
