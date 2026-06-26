import type { AppSettings } from './types';

export const APP_NAME = 'Voca Note';
export const BACKUP_SCHEMA_VERSION = 1;
export const HISTORY_LIMIT = 2000;

export const SETTINGS_STORAGE_KEY = 'voca-note/settings/v1';
export const SESSION_TOKEN_KEY = 'voca-note/sync-token/session';
export const LOCAL_TOKEN_KEY = 'voca-note/sync-token/local';
export const SESSION_SUPABASE_SESSION_KEY = 'voca-note/supabase-session/session';
export const LOCAL_SUPABASE_SESSION_KEY = 'voca-note/supabase-session/local';

const DEFAULT_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const DEFAULT_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

// True when a shared Supabase project is baked into the build (env vars set).
// In that case end users never see URL/anon-key fields — they just sign in.
export const HAS_BUNDLED_SUPABASE = Boolean(DEFAULT_SUPABASE_URL && DEFAULT_SUPABASE_ANON_KEY);

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  providers: [
    {
      id: 'naver-search',
      name: 'Naver Search',
      template: 'https://search.naver.com/search.naver?query={query}',
      kind: 'search',
      enabled: true
    },
    {
      id: 'naver-dictionary',
      name: 'Naver English Dictionary',
      template: 'https://search.naver.com/search.naver?where=dic&query={query}',
      kind: 'dictionary',
      enabled: true
    },
    {
      id: 'daum-search',
      name: 'Daum Search',
      template: 'https://search.daum.net/search?q={query}',
      kind: 'search',
      enabled: true
    },
    {
      id: 'daum-dictionary',
      name: 'Daum Dictionary',
      template: 'https://dic.daum.net/search.do?q={query}&dic={lang}',
      kind: 'dictionary',
      enabled: true
    }
  ],
  dictionaryProviderId: 'daum-dictionary',
  searchProviderId: 'daum-search',
  autocompleteSource: 'dictionary',
  dictionaryLang: 'eng',
  domains: [],
  shortcuts: {
    focusSearch: '/',
    close: 'Escape',
    help: '?',
    goHistory: 'g h',
    goWordbook: 'g w',
    goAbbrev: 'g a',
    goReview: 'g r',
    goSettings: 'g s'
  },
  sync: {
    mode: 'local',
    gistId: '',
    rememberToken: false,
    supabase: {
      url: DEFAULT_SUPABASE_URL,
      anonKey: DEFAULT_SUPABASE_ANON_KEY,
      email: '',
      rememberSession: false
    }
  }
};

export const NAV_ITEMS = [
  { key: 'history', label: 'History' },
  { key: 'wordbook', label: 'Wordbook' },
  { key: 'abbrev', label: 'Abbrev' },
  { key: 'review', label: 'Review' },
  { key: 'settings', label: 'Settings' }
] as const;
