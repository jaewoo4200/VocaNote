import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { APP_NAME, HAS_BUNDLED_SUPABASE, NAV_ITEMS } from './constants';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useMediaQuery } from './hooks/useMediaQuery';
import {
  buildAutocompleteSuggestions,
  type AutocompleteSuggestion
} from './lib/autocomplete';
import { entriesToAbbrCsv, entriesToWordCsv, parseImportInput } from './lib/csv';
import { LLM_IMPORT_PROMPT, parseLlmJson } from './lib/llmImport';
import {
  findAcademicAbbrevSuggestions,
  loadAbbrevSeeds,
  type AcademicAbbrevSuggestion
} from './lib/academicAbbrev';
import {
  findAcademicWordSuggestions,
  type AcademicWordSuggestion
} from './lib/academicWord';
import { createPrivateGist, readGistBackup, updateGistBackup } from './lib/gistSync';
import {
  exportBackupPayload,
  getEntries,
  getHistory,
  putEntries,
  putEntry,
  recordHistory,
  restoreBackupPayload,
  tombstoneEntry
} from './lib/idb';
import { createId } from './lib/id';
import { applyImportRows } from './lib/importer';
import { mergeBackup } from './lib/merge';
import { createStableKey, normalizeListField, normalizeTerm } from './lib/normalize';
import { buildProviderUrl, openExternal } from './lib/providers';
import { buildMeaningPreview, hasMeaning, rankAbbrExpansions, searchEntries, toReviewQueue } from './lib/search';
import { fetchLookupText, selectLookupPreview } from './lib/textLookup';
import { loadWordlist, queryWordlist } from './lib/wordlist';
import {
  fetchLiveSuggestions,
  fetchQuickMeaning,
  inferSuggestEngine,
  isAbortError,
  type Suggestion,
  type SuggestEngine
} from './lib/suggest';
import { validateBackupPayload } from './lib/backup';
import { Modal } from './components/Modal';
import { EntryDetail } from './components/EntryDetail';
import { SpotlightTour } from './components/SpotlightTour';

const ONBOARDED_KEY = 'voca-note/onboarded/v1';
import { applyTheme, watchSystemTheme } from './lib/theme';
import {
  clearSupabaseSession,
  getSupabaseSession,
  clearSyncToken,
  getSyncToken,
  loadSettings,
  saveSettings,
  setSupabaseSession as persistSupabaseSession,
  setSyncToken as persistSyncToken
} from './lib/settings';
import {
  isSupabaseSessionExpired,
  readSupabaseBackup,
  refreshSupabaseSession,
  sendSupabaseEmailOtp,
  signOutSupabase,
  upsertSupabaseBackup,
  verifySupabaseEmailOtp
} from './lib/supabaseSync';
import type {
  AppSettings,
  EntryType,
  PanelKey,
  ReviewItem,
  SearchProvider,
  SupabaseSession,
  VocabEntry
} from './types';

type WordbookFilter = 'recent' | 'frequent' | 'favorite' | 'tag' | 'undefined';

interface MeaningModalState {
  term: string;
  type: EntryType;
  fullExpansion: string;
  meaningKo: string;
  notes: string;
  tags: string;
  domains: string;
  favorite: boolean;
}

interface LookupTextState {
  term: string;
  mode: 'dictionary' | 'search';
  providerName: string;
  sourceUrl: string;
  status: 'loading' | 'loaded' | 'error';
  text: string;
  viaProxy: boolean;
  refreshing?: boolean;
  error?: string;
}

const PANEL_SET: Set<string> = new Set(NAV_ITEMS.map((item) => item.key));

function parsePanel(pathname: string): PanelKey {
  const normalized = pathname.replace(/^\//, '').trim();
  if (PANEL_SET.has(normalized)) {
    return normalized as PanelKey;
  }
  return 'history';
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message?.trim();
    const lower = message.toLowerCase();
    if (error.name === 'AbortError' || lower.includes('aborted') || lower.includes('abort')) {
      return '요청이 취소되었거나 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.';
    }
    if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed')) {
      return '네트워크 연결 또는 브라우저 보안 정책으로 조회에 실패했습니다.';
    }
    return message || '알 수 없는 오류가 발생했습니다.';
  }
  return '알 수 없는 오류가 발생했습니다.';
}

function downloadText(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  URL.revokeObjectURL(url);
}

async function readFileText(file: File): Promise<string> {
  return await file.text();
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('ko-KR', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function extractMajorMeanings(summaryText: string): string {
  const lines = summaryText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const numbered = lines
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^\d+\.\s+/, '').trim())
    .filter(Boolean);

  return numbered.map((meaning, index) => `${index + 1}) ${meaning}`).join('\n');
}

function formatQuickLookup(suggestion: { term: string; meaningKo?: string }): string {
  const meaning = suggestion.meaningKo ?? '';
  const senses = meaning
    .split(/[,;·]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const body = senses.length > 0 ? senses.map((m, i) => `${i + 1}. ${m}`) : [`1. ${meaning}`];
  return ['주요 뜻 (빠른 사전)', `단어: ${suggestion.term}`, ...body].join('\n');
}

function createEmptyEntry(term: string, type: EntryType, now: number): VocabEntry {
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

function createModalSeed(term: string, type: EntryType): MeaningModalState {
  return {
    term,
    type,
    fullExpansion: '',
    meaningKo: '',
    notes: '',
    tags: '',
    domains: '',
    favorite: false
  };
}

function createProvider(): SearchProvider {
  const id = `provider-${Date.now()}`;
  return {
    id,
    name: 'Custom Provider',
    template: 'https://example.com?q={query}',
    kind: 'search',
    enabled: true
  };
}

function createLookupCacheKey(mode: 'dictionary' | 'search', providerName: string, term: string): string {
  return `${mode}::${normalizeTerm(providerName)}::${normalizeTerm(term)}`;
}


function App(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);
  const reviewInputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<number | null>(null);
  const lookupCacheRef = useRef<Map<string, { text: string; viaProxy: boolean }>>(new Map());
  const lookupRequestSeqRef = useRef(0);
  const autoSyncSkipRef = useRef(false);
  const autoSyncTimerRef = useRef<number | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [entries, setEntries] = useState<VocabEntry[]>([]);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getHistory>>>([]);
  const [activePanel, setActivePanel] = useState<PanelKey>('history');
  const [selectedStableKey, setSelectedStableKey] = useState('');
  const [query, setQuery] = useState('');
  const [isHelpOpen, setHelpOpen] = useState(false);
  const [wordbookFilter, setWordbookFilter] = useState<WordbookFilter>('recent');
  const [tagFilter, setTagFilter] = useState('');
  const [meaningModal, setMeaningModal] = useState<MeaningModalState | null>(null);
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<'auto' | 'csv' | 'text'>('auto');
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [llmText, setLlmText] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [domainInput, setDomainInput] = useState('');
  // Show raw Supabase URL/anon-key fields only when no shared project is baked in,
  // or when the user explicitly opens "advanced" (self-host their own project).
  const [showSyncAdvanced, setShowSyncAdvanced] = useState(!HAS_BUNDLED_SUPABASE);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDED_KEY) !== '1';
    } catch {
      return false;
    }
  });
  const [syncToken, setSyncToken] = useState(() => getSyncToken());
  const [supabaseOtp, setSupabaseOtp] = useState('');
  const [supabaseSession, setSupabaseSessionState] = useState<SupabaseSession | null>(() => getSupabaseSession());
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewMeaning, setReviewMeaning] = useState('');
  const [lookupTextState, setLookupTextState] = useState<LookupTextState | null>(null);
  const [quickMeaningDraft, setQuickMeaningDraft] = useState('');
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState(-1);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [wordlistReady, setWordlistReady] = useState(false);
  const [abbrevReady, setAbbrevReady] = useState(false);
  const [liveSuggest, setLiveSuggest] = useState<{ query: string; items: Suggestion[] }>({
    query: '',
    items: []
  });
  const [liveLoading, setLiveLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const isMobile = useMediaQuery('(max-width: 1023px)');
  const debouncedQuery = useDebouncedValue(query, 50);
  const debouncedLiveQuery = useDebouncedValue(query, 140);

  const selectedEntry = useMemo(() => {
    return entries.find((entry) => entry.stableKey === selectedStableKey && !entry.deletedAt);
  }, [entries, selectedStableKey]);

  const liveEntries = useMemo(() => {
    return entries.filter((entry) => !entry.deletedAt);
  }, [entries]);

  const reviewQueue = useMemo(() => {
    return toReviewQueue(liveEntries);
  }, [liveEntries]);

  const searchResults = useMemo(() => {
    return searchEntries(liveEntries, debouncedQuery, settings.domains);
  }, [debouncedQuery, liveEntries, settings.domains]);

  const academicAbbrevSuggestions = useMemo(() => {
    void abbrevReady;
    return findAcademicAbbrevSuggestions(debouncedQuery, settings.domains, liveEntries);
  }, [debouncedQuery, liveEntries, settings.domains, abbrevReady]);

  const academicWordSuggestions = useMemo(() => {
    return findAcademicWordSuggestions(debouncedQuery, settings.domains, liveEntries);
  }, [debouncedQuery, liveEntries, settings.domains]);

  const wordEntries = useMemo(() => {
    return liveEntries.filter((entry) => entry.type === 'word');
  }, [liveEntries]);

  const abbrEntries = useMemo(() => {
    return liveEntries.filter((entry) => entry.type === 'abbr').sort((a, b) => b.updatedAt - a.updatedAt);
  }, [liveEntries]);

  const allTags = useMemo(() => {
    return Array.from(
      new Set(liveEntries.flatMap((entry) => entry.tags).filter(Boolean).map((tag) => tag.trim()))
    ).sort();
  }, [liveEntries]);

  const historyMap = useMemo(() => {
    return new Map(history.map((item) => [item.termNorm, item]));
  }, [history]);

  const filteredWordEntries = useMemo(() => {
    let list = [...wordEntries];

    if (wordbookFilter === 'favorite') {
      list = list.filter((entry) => entry.favorite);
    }

    if (wordbookFilter === 'undefined') {
      list = list.filter((entry) => !entry.meaningKo?.trim());
    }

    if (wordbookFilter === 'tag') {
      list = list.filter((entry) => (tagFilter ? entry.tags.includes(tagFilter) : true));
    }

    if (wordbookFilter === 'frequent') {
      list.sort((left, right) => {
        const leftCount = historyMap.get(left.termNorm)?.seenCount ?? 0;
        const rightCount = historyMap.get(right.termNorm)?.seenCount ?? 0;
        return rightCount - leftCount;
      });
      return list;
    }

    list.sort((left, right) => right.updatedAt - left.updatedAt);
    return list;
  }, [historyMap, tagFilter, wordEntries, wordbookFilter]);

  const dictionaryProvider = useMemo(() => {
    return (
      settings.providers.find(
        (provider) => provider.id === settings.dictionaryProviderId && provider.enabled
      ) ?? settings.providers.find((provider) => provider.kind === 'dictionary' && provider.enabled)
    );
  }, [settings.dictionaryProviderId, settings.providers]);

  const searchProvider = useMemo(() => {
    return (
      settings.providers.find((provider) => provider.id === settings.searchProviderId && provider.enabled) ??
      settings.providers.find((provider) => provider.kind === 'search' && provider.enabled)
    );
  }, [settings.providers, settings.searchProviderId]);

  // The provider that drives autocomplete + live suggest, and the engine
  // (daum/naver) inferred from it. Wiring this to the header selectors makes the
  // "사전/검색 엔진" dropdowns actually change the autocomplete source.
  const autocompleteProvider = useMemo(
    () => (settings.autocompleteSource === 'search' ? searchProvider : dictionaryProvider),
    [dictionaryProvider, searchProvider, settings.autocompleteSource]
  );
  const autocompleteEngine = useMemo<SuggestEngine>(
    () => inferSuggestEngine(autocompleteProvider?.id, autocompleteProvider?.template),
    [autocompleteProvider?.id, autocompleteProvider?.template]
  );

  // Autocomplete merges three sources, with local ones resolving instantly so
  // there's zero typing delay: (1) my entries, (3) the offline frequency word
  // list — both off the raw `query`; (2) live Daum/Naver suggestions with real
  // Korean meanings stream in via `liveSuggest` a moment later. `wordlistReady`
  // is read so the memo recomputes once the offline dictionary finishes loading.
  const autocompleteSuggestions = useMemo<AutocompleteSuggestion[]>(() => {
    void wordlistReady;
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }
    // Only use live results that belong to the current query (avoid stale meanings).
    const live = liveSuggest.query === normalizeTerm(trimmed) ? liveSuggest.items : [];
    return buildAutocompleteSuggestions({
      query: trimmed,
      entries: liveEntries,
      preferredDomains: settings.domains,
      liveSuggestions: live,
      liveEngine: autocompleteEngine,
      dictionaryMatches: queryWordlist(trimmed, 20),
      limit: 10
    });
  }, [query, liveEntries, settings.domains, wordlistReady, liveSuggest, autocompleteEngine]);

  const dictionaryOptions = useMemo(
    () => settings.providers.filter((provider) => provider.kind === 'dictionary' && provider.enabled),
    [settings.providers]
  );

  const searchOptions = useMemo(
    () => settings.providers.filter((provider) => provider.kind === 'search' && provider.enabled),
    [settings.providers]
  );

  const currentReview = reviewQueue[reviewIndex];
  const supabaseConfig = useMemo(
    () => ({
      url: settings.sync.supabase.url.trim(),
      anonKey: settings.sync.supabase.anonKey.trim(),
      email: settings.sync.supabase.email.trim(),
      rememberSession: settings.sync.supabase.rememberSession
    }),
    [settings.sync.supabase.anonKey, settings.sync.supabase.email, settings.sync.supabase.rememberSession, settings.sync.supabase.url]
  );
  const hasSupabaseConfig = Boolean(supabaseConfig.url && supabaseConfig.anonKey);

  const persistEntry = useCallback(async (entry: VocabEntry) => {
    await putEntry(entry);
    setEntries((prev) => {
      const index = prev.findIndex((item) => item.stableKey === entry.stableKey);
      if (index < 0) {
        return [entry, ...prev].sort((a, b) => b.updatedAt - a.updatedAt);
      }

      const next = [...prev];
      next[index] = entry;
      return next.sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }, []);

  const refreshHistory = useCallback(async () => {
    setHistory(await getHistory());
  }, []);

  const syncPanelRoute = useCallback(
    (panel: PanelKey) => {
      setActivePanel(panel);
      if (panel !== 'history') {
        lookupRequestSeqRef.current += 1;
        setLookupTextState(null);
      }
      setAutocompleteOpen(false);
      setAutocompleteIndex(-1);
      navigate(`/${panel}`);
    },
    [navigate]
  );

  // Reset to a clean "main page" state: clear the search, any open lookup/detail,
  // and route to History. Triggered by clicking the top-left logo.
  const goHome = useCallback(() => {
    setQuery('');
    setSelectedStableKey('');
    setAutocompleteOpen(false);
    setAutocompleteIndex(-1);
    lookupRequestSeqRef.current += 1;
    setLookupTextState(null);
    setActivePanel('history');
    navigate('/history');
    searchRef.current?.focus();
  }, [navigate]);

  const buildLookupUrl = useCallback(
    (mode: 'dictionary' | 'search', term: string): { url: string; providerName: string } | null => {
      const provider = mode === 'dictionary' ? dictionaryProvider : searchProvider;
      if (!provider) {
        setStatusMessage(
          mode === 'dictionary'
            ? '활성화된 사전 제공자가 없습니다. Settings에서 확인해주세요.'
            : '활성화된 검색 제공자가 없습니다. Settings에서 확인해주세요.'
        );
        return null;
      }

      return {
        url: buildProviderUrl({
          provider,
          query: term,
          lang: settings.dictionaryLang
        }),
        providerName: provider.name
      };
    },
    [dictionaryProvider, searchProvider, settings.dictionaryLang]
  );

  const commitHistory = useCallback(
    async (term: string) => {
      const normalized = term.trim();
      if (!normalized) {
        return;
      }
      await recordHistory(normalizeTerm(normalized), normalized);
      await refreshHistory();
    },
    [refreshHistory]
  );

  const runLookupText = useCallback(
    async (mode: 'dictionary' | 'search', term: string) => {
      const normalized = term.trim();
      if (!normalized) {
        return;
      }

      const lookup = buildLookupUrl(mode, normalized);
      if (!lookup) {
        return;
      }

      const requestId = lookupRequestSeqRef.current + 1;
      lookupRequestSeqRef.current = requestId;
      const cacheKey = createLookupCacheKey(mode, lookup.providerName, normalized);
      const cached = lookupCacheRef.current.get(cacheKey);

      // Do not block lookup rendering on IndexedDB history writes.
      void commitHistory(normalized);
      if (cached) {
        setLookupTextState({
          term: normalized,
          mode,
          providerName: lookup.providerName,
          sourceUrl: lookup.url,
          status: 'loaded',
          text: cached.text,
          viaProxy: cached.viaProxy,
          refreshing: true
        });
      } else {
        setLookupTextState({
          term: normalized,
          mode,
          providerName: lookup.providerName,
          sourceUrl: lookup.url,
          status: 'loading',
          text: '',
          viaProxy: false,
          refreshing: false
        });
      }

      // Dictionary lookups: the suggest API returns a clean Korean meaning in
      // ~150ms and is far more reliable than scraping JS-rendered dictionary
      // pages (which often yield menu noise). Use it as the PRIMARY, fast result.
      // Only fall through to the slow full-page text scrape when the dictionary
      // has nothing (rare/technical words) or for explicit "search" lookups.
      if (mode === 'dictionary' && !cached) {
        try {
          const quickEngine = inferSuggestEngine(undefined, lookup.providerName);
          const quick = await fetchQuickMeaning(
            normalized,
            quickEngine,
            settings.dictionaryLang || 'eng'
          );
          if (requestId !== lookupRequestSeqRef.current) {
            return;
          }
          if (quick?.meaningKo) {
            const text = formatQuickLookup(quick);
            lookupCacheRef.current.set(cacheKey, { text, viaProxy: false });
            setLookupTextState({
              term: normalized,
              mode,
              providerName: lookup.providerName,
              sourceUrl: lookup.url,
              status: 'loaded',
              text,
              viaProxy: false,
              refreshing: false
            });
            return;
          }
        } catch (error) {
          if (isAbortError(error) || requestId !== lookupRequestSeqRef.current) {
            return;
          }
          // otherwise fall through to the full-page scrape below
        }
      }

      try {
        const fetched = await fetchLookupText(lookup.url);
        if (requestId !== lookupRequestSeqRef.current) {
          return;
        }
        const preview = selectLookupPreview(fetched.text, normalized);
        lookupCacheRef.current.set(cacheKey, {
          text: preview,
          viaProxy: fetched.viaProxy
        });
        setLookupTextState({
          term: normalized,
          mode,
          providerName: lookup.providerName,
          sourceUrl: lookup.url,
          status: 'loaded',
          text: preview,
          viaProxy: fetched.viaProxy,
          refreshing: false
        });
      } catch (error) {
        if (requestId !== lookupRequestSeqRef.current) {
          return;
        }
        if (cached) {
          setLookupTextState({
            term: normalized,
            mode,
            providerName: lookup.providerName,
            sourceUrl: lookup.url,
            status: 'loaded',
            text: cached.text,
            viaProxy: cached.viaProxy,
            refreshing: false
          });
          setStatusMessage('최신 조회에 실패해 캐시된 사전 텍스트를 표시했습니다.');
          return;
        }

        setLookupTextState({
          term: normalized,
          mode,
          providerName: lookup.providerName,
          sourceUrl: lookup.url,
          status: 'error',
          text: '',
          viaProxy: false,
          refreshing: false,
          error: toErrorMessage(error)
        });
      }
    },
    [buildLookupUrl, commitHistory, settings.dictionaryLang]
  );

  const openLookupExternal = useCallback(
    (mode: 'dictionary' | 'search', term: string) => {
      const normalized = term.trim();
      if (!normalized) {
        return;
      }
      const lookup = buildLookupUrl(mode, normalized);
      if (!lookup) {
        return;
      }
      openExternal(lookup.url);
    },
    [buildLookupUrl]
  );

  const closeEverything = useCallback(() => {
    if (autocompleteOpen) {
      setAutocompleteOpen(false);
      setAutocompleteIndex(-1);
      return;
    }

    if (meaningModal) {
      setMeaningModal(null);
      return;
    }

    if (isHelpOpen) {
      setHelpOpen(false);
      return;
    }

    if (selectedStableKey) {
      setSelectedStableKey('');
      return;
    }

    if (lookupTextState) {
      lookupRequestSeqRef.current += 1;
      setLookupTextState(null);
      return;
    }

    searchRef.current?.blur();
  }, [autocompleteOpen, isHelpOpen, lookupTextState, meaningModal, selectedStableKey]);

  useKeyboardShortcuts({
    shortcuts: settings.shortcuts,
    onNavigate: syncPanelRoute,
    onFocusSearch: () => searchRef.current?.focus(),
    onClose: closeEverything,
    onOpenHelp: () => setHelpOpen(true)
  });

  useEffect(() => {
    const panel = parsePanel(location.pathname);
    setActivePanel(panel);
    if (!PANEL_SET.has(location.pathname.replace(/^\//, ''))) {
      navigate('/history', { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [loadedEntries, loadedHistory] = await Promise.all([getEntries(true), getHistory()]);
      setEntries(loadedEntries);
      setHistory(loadedHistory);
      setLoading(false);
      searchRef.current?.focus();
    })();
  }, []);

  // Load the bundled English word list once for instant offline autocomplete.
  useEffect(() => {
    void loadWordlist(`${import.meta.env.BASE_URL}wordlist.txt`)
      .then(() => setWordlistReady(true))
      .catch(() => {
        // Dictionary suggestions are best-effort; the user's own entries still
        // autocomplete instantly without it.
      });
  }, []);

  // Load the bundled abbreviation/glossary datasets (merge with built-in academic
  // seeds): EE/comms abbreviations + ktword.co.kr glossary (with source links).
  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    void (async () => {
      for (const file of ['abbreviations.json', 'ktword.json']) {
        try {
          await loadAbbrevSeeds(`${base}${file}`);
          setAbbrevReady((prev) => !prev); // toggle to force suggestion recompute
        } catch {
          // Best-effort; built-in seeds remain available.
        }
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!supabaseSession) {
      return;
    }

    persistSupabaseSession(supabaseSession, settings.sync.supabase.rememberSession);
  }, [settings.sync.supabase.rememberSession, supabaseSession]);

  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== 'system') {
      return;
    }

    return watchSystemTheme(() => applyTheme('system'));
  }, [settings.theme]);

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const handle = window.setTimeout(() => setStatusMessage(''), 3000);
    return () => window.clearTimeout(handle);
  }, [statusMessage]);

  // Keep the highlighted autocomplete row in range as suggestions change.
  useEffect(() => {
    setAutocompleteIndex((prev) =>
      prev < 0 ? -1 : Math.min(prev, autocompleteSuggestions.length - 1)
    );
  }, [autocompleteSuggestions.length]);

  // Live Daum suggestions (real Korean meanings) — fetched via JSONP, debounced,
  // and merged into the instant local list above. Aborts on each new keystroke.
  useEffect(() => {
    const term = debouncedLiveQuery.trim();
    const termNorm = normalizeTerm(term);
    if (!isSearchFocused || termNorm.length < 2) {
      setLiveLoading(false);
      setLiveSuggest((prev) => (prev.items.length ? { query: '', items: [] } : prev));
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setLiveLoading(true);

    void (async () => {
      try {
        const items = await fetchLiveSuggestions(
          term,
          autocompleteEngine,
          settings.autocompleteSource,
          settings.dictionaryLang || 'eng',
          controller.signal
        );
        if (!cancelled) {
          setLiveSuggest({ query: termNorm, items });
        }
      } catch (error) {
        if (!cancelled && !isAbortError(error)) {
          setLiveSuggest({ query: termNorm, items: [] });
        }
      } finally {
        if (!cancelled) {
          setLiveLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debouncedLiveQuery, isSearchFocused, autocompleteEngine, settings.autocompleteSource, settings.dictionaryLang]);

  useEffect(() => {
    if (reviewQueue.length === 0) {
      setReviewIndex(0);
      setReviewMeaning('');
      return;
    }

    if (reviewIndex > reviewQueue.length - 1) {
      setReviewIndex(reviewQueue.length - 1);
    }
  }, [reviewIndex, reviewQueue.length]);

  useEffect(() => {
    if (activePanel === 'review') {
      reviewInputRef.current?.focus();
    }
  }, [activePanel, reviewIndex]);

  useEffect(() => {
    if (!lookupTextState || lookupTextState.status !== 'loaded') {
      return;
    }
    setQuickMeaningDraft(extractMajorMeanings(lookupTextState.text));
  }, [lookupTextState]);

  const handleSaveMeaning = useCallback(async () => {
    if (!meaningModal) {
      return;
    }

    const term = meaningModal.term.trim();
    const meaning = meaningModal.meaningKo.trim();
    if (!term || !meaning) {
      setStatusMessage('term과 meaningKo는 필수입니다.');
      return;
    }

    const now = Date.now();
    const stableKey = createStableKey(term, meaningModal.type);
    const existing = entries.find((entry) => entry.stableKey === stableKey);
    const next = existing
      ? {
          ...existing,
          term,
          termNorm: normalizeTerm(term),
          tags: normalizeListField(meaningModal.tags),
          notes: meaningModal.notes.trim(),
          favorite: meaningModal.favorite,
          deletedAt: undefined,
          updatedAt: now,
          expansions: existing.expansions.map((expansion) => ({ ...expansion }))
        }
      : createEmptyEntry(term, meaningModal.type, now);

    next.tags = normalizeListField(meaningModal.tags);
    next.notes = meaningModal.notes.trim();
    next.favorite = meaningModal.favorite;
    next.updatedAt = now;
    next.deletedAt = undefined;

    if (meaningModal.type === 'word') {
      next.meaningKo = meaning;
    } else {
      if (meaningModal.fullExpansion.trim()) {
        const domainList = normalizeListField(meaningModal.domains);
        const expansionTerm = meaningModal.fullExpansion.trim();
        const expansionNorm = normalizeTerm(expansionTerm);
        const found = next.expansions.find(
          (expansion) => normalizeTerm(expansion.fullExpansion) === expansionNorm
        );

        if (found) {
          found.meaningKo = meaning;
          found.notes = meaningModal.notes.trim() || found.notes;
          found.tags = normalizeListField(meaningModal.tags);
          found.favorite = meaningModal.favorite;
          found.domains = domainList.length > 0 ? domainList : found.domains;
          found.updatedAt = now;
          found.deletedAt = undefined;
        } else {
          const id = createId('exp');
          next.expansions.push({
            id,
            fullExpansion: expansionTerm,
            meaningKo: meaning,
            domains: domainList,
            tags: normalizeListField(meaningModal.tags),
            notes: meaningModal.notes.trim(),
            favorite: meaningModal.favorite,
            updatedAt: now
          });
          if (!next.priorityExpansionId) {
            next.priorityExpansionId = id;
          }
        }
      } else {
        next.meaningKo = meaning;
      }
    }

    await persistEntry(next);
    setMeaningModal(null);
    setSelectedStableKey(next.stableKey);
    setStatusMessage('뜻이 저장되었습니다.');
  }, [entries, meaningModal, persistEntry]);

  const handleSearchSubmit = useCallback((inputTerm?: string) => {
    const term = (inputTerm ?? query).trim();
    if (!term) {
      return;
    }

    const termNorm = normalizeTerm(term);
    const exactDefined = liveEntries.find(
      (entry) => entry.termNorm === termNorm && !entry.deletedAt && hasMeaning(entry)
    );

    if (exactDefined) {
      void commitHistory(term);
      // Invalidate any in-flight lookup so a late response can't resurrect the
      // lookup panel over the entry we're about to select.
      lookupRequestSeqRef.current += 1;
      setLookupTextState(null);
      setSelectedStableKey(exactDefined.stableKey);
      return;
    }

    const ranked = searchEntries(liveEntries, term, settings.domains);
    const topDefined = ranked.find((result) => result.hasMeaning);
    if (topDefined) {
      void commitHistory(term);
      lookupRequestSeqRef.current += 1;
      setLookupTextState(null);
      setSelectedStableKey(topDefined.entry.stableKey);
      return;
    }

    void runLookupText('dictionary', term);
  }, [commitHistory, liveEntries, query, runLookupText, settings.domains]);

  const applyAutocompleteSuggestion = useCallback(
    (suggestion: AutocompleteSuggestion, submit: boolean) => {
      setQuery(suggestion.term);
      setAutocompleteOpen(false);
      setAutocompleteIndex(-1);
      if (submit) {
        handleSearchSubmit(suggestion.term);
      }
    },
    [handleSearchSubmit]
  );

  // One-tap save from the autocomplete dropdown: if the row already carries a
  // Korean meaning (Daum/Naver), save it straight to the wordbook; otherwise
  // open the save modal seeded with the term.
  const handleQuickSaveSuggestion = useCallback(
    async (suggestion: AutocompleteSuggestion) => {
      const term = suggestion.term.trim();
      if (!term) {
        return;
      }
      setAutocompleteOpen(false);
      setAutocompleteIndex(-1);

      if (!suggestion.meaningKo) {
        const suggestedType: EntryType = /^[A-Z0-9-]{2,}$/.test(term) ? 'abbr' : 'word';
        setMeaningModal(createModalSeed(term, suggestedType));
        return;
      }

      const now = Date.now();
      const stableKey = createStableKey(term, 'word');
      const existing = entries.find((entry) => entry.stableKey === stableKey);
      const next: VocabEntry = existing
        ? {
            ...existing,
            type: 'word',
            term,
            termNorm: normalizeTerm(term),
            meaningKo: existing.meaningKo?.trim() || suggestion.meaningKo,
            deletedAt: undefined,
            updatedAt: now
          }
        : { ...createEmptyEntry(term, 'word', now), meaningKo: suggestion.meaningKo };

      await persistEntry(next);
      setStatusMessage(`'${term}' 단어장에 저장했습니다.`);
    },
    [entries, persistEntry]
  );

  const handleOpenSaveModalFromQuery = useCallback(() => {
    const term = query.trim();
    if (!term) {
      return;
    }

    const suggestedType: EntryType = /^[A-Z0-9\-]{2,}$/.test(term) ? 'abbr' : 'word';
    setMeaningModal(createModalSeed(term, suggestedType));
  }, [query]);

  const handleOpenSaveModalFromEntry = useCallback((entry: VocabEntry, reviewItem?: ReviewItem) => {
    if (entry.type === 'word') {
      setMeaningModal({
        term: entry.term,
        type: 'word',
        fullExpansion: '',
        meaningKo: entry.meaningKo ?? '',
        notes: entry.notes,
        tags: entry.tags.join(', '),
        domains: '',
        favorite: entry.favorite
      });
      return;
    }

    if (reviewItem?.expansionId) {
      const expansion = entry.expansions.find((item) => item.id === reviewItem.expansionId);
      if (expansion) {
        setMeaningModal({
          term: entry.term,
          type: 'abbr',
          fullExpansion: expansion.fullExpansion,
          meaningKo: expansion.meaningKo ?? '',
          notes: expansion.notes || entry.notes,
          tags: Array.from(new Set([...entry.tags, ...expansion.tags])).join(', '),
          domains: expansion.domains.join(', '),
          favorite: expansion.favorite || entry.favorite
        });
        return;
      }
    }

    setMeaningModal({
      term: entry.term,
      type: 'abbr',
      fullExpansion: '',
      meaningKo: entry.meaningKo ?? '',
      notes: entry.notes,
      tags: entry.tags.join(', '),
      domains: '',
      favorite: entry.favorite
    });
  }, []);

  const handleDeleteEntry = useCallback(
    async (entry: VocabEntry) => {
      await tombstoneEntry(entry.stableKey);
      setEntries((prev) =>
        prev.map((item) =>
          item.stableKey === entry.stableKey
            ? {
                ...item,
                deletedAt: Date.now(),
                updatedAt: Date.now()
              }
            : item
        )
      );
      if (selectedStableKey === entry.stableKey) {
        setSelectedStableKey('');
      }
      setStatusMessage('삭제 처리되었습니다. (동기화 시 tombstone 유지)');
    },
    [selectedStableKey]
  );

  const handleImportRows = useCallback(
    async (raw: string) => {
      const parsed = parseImportInput(raw, importMode);
      setImportWarnings(parsed.warnings);
      if (parsed.rows.length === 0) {
        setStatusMessage('가져올 항목이 없습니다.');
        return;
      }

      const next = applyImportRows(entries, parsed.rows);
      await putEntries(next);
      setEntries(next);
      setStatusMessage(`${parsed.rows.length}개 항목을 가져왔습니다.`);
      syncPanelRoute('review');
    },
    [entries, importMode, syncPanelRoute]
  );

  const handleImportFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      const raw = await readFileText(file);
      await handleImportRows(raw);
      event.target.value = '';
    },
    [handleImportRows]
  );

  // LLM import: paste the JSON an LLM produced from the copy-paste prompt, parse
  // it (tolerant of code fences / surrounding prose), and merge into the wordbook.
  const handleLlmImport = useCallback(async () => {
    try {
      const rows = parseLlmJson(llmText);
      if (rows.length === 0) {
        setStatusMessage('가져올 항목이 없습니다. JSON 배열을 붙여넣었는지 확인하세요.');
        return;
      }
      const next = applyImportRows(entries, rows);
      await putEntries(next);
      setEntries(next);
      setLlmText('');
      setStatusMessage(`LLM 결과에서 ${rows.length}개 항목을 가져왔습니다.`);
      syncPanelRoute('review');
    } catch (error) {
      setStatusMessage(`LLM 가져오기 실패: ${toErrorMessage(error)}`);
    }
  }, [entries, llmText, syncPanelRoute]);

  const dismissOnboarding = useCallback(() => {
    try {
      localStorage.setItem(ONBOARDED_KEY, '1');
    } catch {
      // ignore storage failures
    }
    setShowOnboarding(false);
  }, []);

  const handleCopyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(LLM_IMPORT_PROMPT);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      setStatusMessage('클립보드 복사에 실패했습니다. 프롬프트를 직접 선택해 복사하세요.');
    }
  }, []);

  const handleExportWordCsv = useCallback(() => {
    downloadText('wordbook.csv', entriesToWordCsv(liveEntries), 'text/csv;charset=utf-8');
  }, [liveEntries]);

  const handleExportAbbrCsv = useCallback(() => {
    downloadText('abbrev.csv', entriesToAbbrCsv(liveEntries), 'text/csv;charset=utf-8');
  }, [liveEntries]);

  const handleExportJson = useCallback(async () => {
    const backup = await exportBackupPayload();
    downloadText('vocab-vault.json', JSON.stringify(backup, null, 2), 'application/json;charset=utf-8');
  }, []);

  const handleRestoreJson = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const raw = await readFileText(file);
      // Validate BEFORE restoring: restoreBackupPayload clears the local store
      // first, so an invalid/foreign file would otherwise wipe the user's data.
      const payload = validateBackupPayload(JSON.parse(raw));
      await restoreBackupPayload(payload);
      const [nextEntries, nextHistory] = await Promise.all([getEntries(true), getHistory()]);
      setEntries(nextEntries);
      setHistory(nextHistory);
      setSelectedStableKey('');
      setStatusMessage('JSON 백업 복원이 완료되었습니다.');
    } catch (error) {
      setStatusMessage(`JSON 복원 실패: ${toErrorMessage(error)}`);
    } finally {
      event.target.value = '';
    }
  }, []);

  const getReadySupabaseSession = useCallback(async (): Promise<SupabaseSession> => {
    if (!hasSupabaseConfig) {
      throw new Error('Supabase URL과 anon key를 먼저 설정해주세요.');
    }

    if (!supabaseSession) {
      throw new Error('Supabase에 먼저 로그인해주세요.');
    }

    if (!isSupabaseSessionExpired(supabaseSession)) {
      return supabaseSession;
    }

    try {
      const refreshed = await refreshSupabaseSession(supabaseConfig, supabaseSession.refreshToken);
      setSupabaseSessionState(refreshed);
      persistSupabaseSession(refreshed, settings.sync.supabase.rememberSession);
      return refreshed;
    } catch {
      clearSupabaseSession();
      setSupabaseSessionState(null);
      throw new Error('Supabase 세션이 만료되었습니다. 이메일 OTP로 다시 로그인해주세요.');
    }
  }, [hasSupabaseConfig, settings.sync.supabase.rememberSession, supabaseConfig, supabaseSession]);

  const syncWithSupabase = useCallback(
    async (session: SupabaseSession) => {
      const local = await exportBackupPayload();
      const remote = await readSupabaseBackup(supabaseConfig, session);
      const merged = remote ? mergeBackup(local, remote) : local;
      await restoreBackupPayload(merged);
      await upsertSupabaseBackup(supabaseConfig, session, merged);
      autoSyncSkipRef.current = true; // 동기화로 인한 setEntries 는 자동동기화 재트리거 방지
      setEntries(merged.entries);
      setHistory(merged.history);
      return merged;
    },
    [supabaseConfig]
  );

  const handleSyncNow = useCallback(async () => {
    if (settings.sync.mode === 'local') {
      setStatusMessage('Sync 모드가 Local only 입니다.');
      return;
    }

    setSyncBusy(true);
    setSyncMessage(settings.sync.mode === 'supabase' ? 'Supabase 동기화 중...' : '동기화 중...');

    try {
      if (settings.sync.mode === 'supabase') {
        const session = await getReadySupabaseSession();
        await syncWithSupabase(session);
        setSyncMessage(`Supabase Sync 완료 (${new Date().toLocaleTimeString('ko-KR')})`);
        return;
      }

      if (!syncToken.trim() || !settings.sync.gistId.trim()) {
        setStatusMessage('Sync token과 gistId를 입력해주세요.');
        return;
      }

      const local = await exportBackupPayload();
      const remote = await readGistBackup(syncToken.trim(), settings.sync.gistId.trim());
      const merged = mergeBackup(local, remote);
      await restoreBackupPayload(merged);
      await updateGistBackup(syncToken.trim(), settings.sync.gistId.trim(), merged);
      setEntries(merged.entries);
      setHistory(merged.history);
      persistSyncToken(syncToken.trim(), settings.sync.rememberToken);
      setSyncMessage(`Sync 완료 (${new Date().toLocaleTimeString('ko-KR')})`);
    } catch (error) {
      setSyncMessage(`Sync 실패: ${toErrorMessage(error)}`);
    } finally {
      setSyncBusy(false);
    }
  }, [
    getReadySupabaseSession,
    settings.sync.gistId,
    settings.sync.mode,
    settings.sync.rememberToken,
    syncToken,
    syncWithSupabase
  ]);

  // 자동 동기화: 단어/기록이 바뀌면 2초 디바운스 후 업로드 (Supabase 로그인 상태에서만).
  // syncWithSupabase 가 유발한 setEntries 는 autoSyncSkipRef 로 건너뛰어 루프 방지.
  useEffect(() => {
    if (settings.sync.mode !== 'supabase' || !supabaseSession) return;
    if (autoSyncSkipRef.current) {
      autoSyncSkipRef.current = false;
      return;
    }
    if (autoSyncTimerRef.current) window.clearTimeout(autoSyncTimerRef.current);
    autoSyncTimerRef.current = window.setTimeout(() => {
      void handleSyncNow();
    }, 2000);
    return () => {
      if (autoSyncTimerRef.current) window.clearTimeout(autoSyncTimerRef.current);
    };
  }, [entries, history, settings.sync.mode, supabaseSession, handleSyncNow]);

  // 창으로 돌아오면(focus) 다른 기기 변경사항을 받아오도록 동기화.
  useEffect(() => {
    if (settings.sync.mode !== 'supabase' || !supabaseSession) return;
    const onFocus = () => void handleSyncNow();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [settings.sync.mode, supabaseSession, handleSyncNow]);

  const handleSendSupabaseOtp = useCallback(async () => {
    if (!hasSupabaseConfig) {
      setStatusMessage('Supabase URL과 anon key를 먼저 설정해주세요.');
      return;
    }

    setSyncBusy(true);
    setSyncMessage('Supabase 인증 코드를 전송하는 중...');

    try {
      await sendSupabaseEmailOtp(supabaseConfig, supabaseConfig.email);
      setSettings((prev) => ({
        ...prev,
        sync: {
          ...prev.sync,
          mode: 'supabase'
        }
      }));
      setSyncMessage('이메일로 8자리 OTP 코드를 보냈습니다.');
    } catch (error) {
      setSyncMessage(`인증 코드 전송 실패: ${toErrorMessage(error)}`);
    } finally {
      setSyncBusy(false);
    }
  }, [hasSupabaseConfig, supabaseConfig]);

  const handleVerifySupabaseOtp = useCallback(async () => {
    if (!hasSupabaseConfig) {
      setStatusMessage('Supabase URL과 anon key를 먼저 설정해주세요.');
      return;
    }

    setSyncBusy(true);
    setSyncMessage('Supabase 로그인 및 초기 동기화 중...');

    try {
      const session = await verifySupabaseEmailOtp(supabaseConfig, supabaseConfig.email, supabaseOtp);
      setSupabaseSessionState(session);
      persistSupabaseSession(session, settings.sync.supabase.rememberSession);
      setSettings((prev) => ({
        ...prev,
        sync: {
          ...prev.sync,
          mode: 'supabase'
        }
      }));
      await syncWithSupabase(session);
      setSupabaseOtp('');
      setSyncMessage(`${session.user.email ?? supabaseConfig.email} 계정 연결 및 동기화 완료`);
    } catch (error) {
      setSyncMessage(`Supabase 로그인 실패: ${toErrorMessage(error)}`);
    } finally {
      setSyncBusy(false);
    }
  }, [hasSupabaseConfig, settings.sync.supabase.rememberSession, supabaseConfig, supabaseOtp, syncWithSupabase]);

  const handleCreateGist = useCallback(async () => {
    if (!syncToken.trim()) {
      setStatusMessage('GitHub token을 먼저 입력해주세요.');
      return;
    }

    setSyncBusy(true);
    setSyncMessage('Private gist 생성 중...');

    try {
      const backup = await exportBackupPayload();
      const gistId = await createPrivateGist(syncToken.trim(), backup);
      setSettings((prev) => ({
        ...prev,
        sync: {
          ...prev.sync,
          mode: 'gist',
          gistId
        }
      }));
      persistSyncToken(syncToken.trim(), settings.sync.rememberToken);
      setSyncMessage(`새 gist 생성 완료: ${gistId}`);
    } catch (error) {
      setSyncMessage(`생성 실패: ${toErrorMessage(error)}`);
    } finally {
      setSyncBusy(false);
    }
  }, [settings.sync.rememberToken, syncToken]);

  const handleConnectGist = useCallback(async () => {
    if (!syncToken.trim() || !settings.sync.gistId.trim()) {
      setStatusMessage('token + gistId를 입력해주세요.');
      return;
    }

    setSyncBusy(true);
    setSyncMessage('Gist 연결 확인 중...');

    try {
      await readGistBackup(syncToken.trim(), settings.sync.gistId.trim());
      setSettings((prev) => ({
        ...prev,
        sync: {
          ...prev.sync,
          mode: 'gist'
        }
      }));
      persistSyncToken(syncToken.trim(), settings.sync.rememberToken);
      setSyncMessage('기존 gist 연결 성공');
    } catch (error) {
      setSyncMessage(`연결 실패: ${toErrorMessage(error)}`);
    } finally {
      setSyncBusy(false);
    }
  }, [settings.sync.gistId, settings.sync.rememberToken, syncToken]);

  const handleDisconnectSync = useCallback(() => {
    clearSupabaseSession();
    setSupabaseSessionState(null);
    setSupabaseOtp('');

    setSettings((prev) => ({
      ...prev,
      sync: {
        ...prev.sync,
        mode: 'local',
        gistId: ''
      }
    }));
    clearSyncToken();
    setSyncToken('');
    setSyncMessage('동기화 연결을 해제했습니다.');
  }, []);

  const handleSupabaseSignOut = useCallback(async () => {
    if (!supabaseSession) {
      clearSupabaseSession();
      setSyncMessage('Supabase 세션이 정리되었습니다.');
      return;
    }

    setSyncBusy(true);
    setSyncMessage('Supabase 로그아웃 중...');

    try {
      if (hasSupabaseConfig) {
        await signOutSupabase(supabaseConfig, supabaseSession);
      }
      clearSupabaseSession();
      setSupabaseSessionState(null);
      setSupabaseOtp('');
      setSyncMessage('Supabase 로그아웃 완료');
    } catch (error) {
      setSyncMessage(`로그아웃 실패: ${toErrorMessage(error)}`);
    } finally {
      setSyncBusy(false);
    }
  }, [hasSupabaseConfig, supabaseConfig, supabaseSession]);

  const handlePinExpansion = useCallback(
    async (entry: VocabEntry, expansionId: string) => {
      const next: VocabEntry = {
        ...entry,
        priorityExpansionId: expansionId,
        updatedAt: Date.now()
      };
      await persistEntry(next);
      setStatusMessage('기본 의미로 고정되었습니다.');
    },
    [persistEntry]
  );

  const handleSaveReviewMeaning = useCallback(async () => {
    if (!currentReview) {
      return;
    }

    const meaning = reviewMeaning.trim();
    if (!meaning) {
      return;
    }

    const entry = entries.find((item) => item.stableKey === currentReview.stableKey);
    if (!entry) {
      return;
    }

    const now = Date.now();
    const next: VocabEntry = {
      ...entry,
      updatedAt: now,
      expansions: entry.expansions.map((expansion) => ({ ...expansion }))
    };

    if (currentReview.type === 'word') {
      next.meaningKo = meaning;
    } else if (currentReview.expansionId) {
      const expansion = next.expansions.find((item) => item.id === currentReview.expansionId);
      if (expansion) {
        expansion.meaningKo = meaning;
        expansion.updatedAt = now;
      } else {
        next.meaningKo = meaning;
      }
    } else {
      next.meaningKo = meaning;
    }

    await persistEntry(next);
    setReviewMeaning('');
    // Do NOT advance the index here: saving a meaning removes this item from the
    // (memoized) review queue, so the next item slides into the current index on
    // its own. Incrementing would skip it. The clamp effect handles the tail.
    setStatusMessage('뜻 저장 후 다음 항목으로 이동했습니다.');
  }, [currentReview, entries, persistEntry, reviewMeaning]);

  const goToNextReview = useCallback(() => {
    setReviewMeaning('');
    setReviewIndex((prev) => Math.min(prev + 1, Math.max(0, reviewQueue.length - 1)));
  }, [reviewQueue.length]);

  const goToPrevReview = useCallback(() => {
    setReviewMeaning('');
    setReviewIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleQuickAddFromLookup = useCallback(async () => {
    if (!lookupTextState) {
      return;
    }

    const term = lookupTextState.term.trim();
    const meaning = quickMeaningDraft.trim();
    if (!term || !meaning) {
      setStatusMessage('저장할 term과 meaningKo를 입력해주세요.');
      return;
    }

    const now = Date.now();
    const stableKey = createStableKey(term, 'word');
    const existing = entries.find((entry) => entry.stableKey === stableKey);

    const next: VocabEntry = existing
      ? {
          ...existing,
          type: 'word',
          term,
          termNorm: normalizeTerm(term),
          meaningKo: meaning,
          deletedAt: undefined,
          updatedAt: now
        }
      : {
          ...createEmptyEntry(term, 'word', now),
          meaningKo: meaning
        };

    await persistEntry(next);
    setSelectedStableKey(next.stableKey);
    setStatusMessage('검색어와 뜻을 단어장에 바로 저장했습니다.');
  }, [entries, lookupTextState, persistEntry, quickMeaningDraft]);

  const handleAddAcademicSuggestion = useCallback(
    async (suggestion: AcademicAbbrevSuggestion) => {
      const now = Date.now();
      const stableKey = createStableKey(suggestion.abbr, 'abbr');
      const existing = entries.find((entry) => entry.stableKey === stableKey);

      const next: VocabEntry = existing
        ? {
            ...existing,
            type: 'abbr',
            term: suggestion.abbr,
            termNorm: normalizeTerm(suggestion.abbr),
            deletedAt: undefined,
            updatedAt: now,
            tags: Array.from(new Set([...existing.tags, 'academic', 'paper'])),
            expansions: existing.expansions.map((expansion) => ({ ...expansion }))
          }
        : {
            ...createEmptyEntry(suggestion.abbr, 'abbr', now),
            tags: ['academic', 'paper']
          };

      const expansionNorm = normalizeTerm(suggestion.fullExpansion);
      const found = next.expansions.find(
        (expansion) => !expansion.deletedAt && normalizeTerm(expansion.fullExpansion) === expansionNorm
      );

      const sourceNote = suggestion.sourceUrl
        ? `출처: ${suggestion.sourceUrl}`
        : suggestion.note ?? '학술 약어 추천';

      if (found) {
        found.meaningKo = suggestion.meaningKo;
        found.domains = Array.from(new Set([...found.domains, ...suggestion.domains]));
        found.tags = Array.from(new Set([...found.tags, 'academic']));
        found.notes = found.notes || sourceNote;
        found.updatedAt = now;
        found.deletedAt = undefined;
      } else {
        const id = createId('exp');
        next.expansions.push({
          id,
          fullExpansion: suggestion.fullExpansion,
          meaningKo: suggestion.meaningKo,
          domains: suggestion.domains,
          tags: ['academic'],
          notes: sourceNote,
          favorite: false,
          updatedAt: now
        });
        if (!next.priorityExpansionId) {
          next.priorityExpansionId = id;
        }
      }

      if (!next.meaningKo?.trim()) {
        next.meaningKo = suggestion.meaningKo;
      }

      await persistEntry(next);
      setSelectedStableKey(next.stableKey);
      setStatusMessage(`${suggestion.abbr} 약어를 단어장에 추가했습니다.`);
    },
    [entries, persistEntry]
  );

  const handleAddAcademicWordSuggestion = useCallback(
    async (suggestion: AcademicWordSuggestion) => {
      const now = Date.now();
      const stableKey = createStableKey(suggestion.term, 'word');
      const existing = entries.find((entry) => entry.stableKey === stableKey);

      const next: VocabEntry = existing
        ? {
            ...existing,
            type: 'word',
            term: suggestion.term,
            termNorm: normalizeTerm(suggestion.term),
            meaningKo: suggestion.meaningKo,
            notes: suggestion.note ?? existing.notes,
            tags: Array.from(new Set([...existing.tags, 'academic', 'paper'])),
            deletedAt: undefined,
            updatedAt: now
          }
        : {
            ...createEmptyEntry(suggestion.term, 'word', now),
            meaningKo: suggestion.meaningKo,
            notes: suggestion.note ?? '학술 단어 추천',
            tags: ['academic', 'paper']
          };

      await persistEntry(next);
      setSelectedStableKey(next.stableKey);
      setStatusMessage(`${suggestion.term} 단어를 단어장에 추가했습니다.`);
    },
    [entries, persistEntry]
  );

  const selectedQueryEntry = useMemo(() => {
    const queryNorm = normalizeTerm(debouncedQuery);
    if (!queryNorm) {
      return undefined;
    }
    return liveEntries.find((entry) => entry.termNorm === queryNorm);
  }, [debouncedQuery, liveEntries]);

  const shouldShowUndefinedActions = useMemo(() => {
    if (!debouncedQuery.trim()) {
      return false;
    }

    if (!selectedQueryEntry) {
      return true;
    }

    return !hasMeaning(selectedQueryEntry);
  }, [debouncedQuery, selectedQueryEntry]);

  const renderLookupTextPanel = () => {
    if (!lookupTextState) {
      return null;
    }

    const lookupTypeLabel = lookupTextState.mode === 'dictionary' ? '사전' : '검색';

    return (
      <div className="surface rounded-xl p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{lookupTypeLabel} 텍스트 결과: {lookupTextState.providerName}</p>
            <p className="text-xs text-[color:var(--text-muted)]">
              {lookupTextState.term} 조회 결과를 텍스트로 요약해 보여줍니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-[color:var(--border)] px-2 py-1 text-xs"
              onClick={() => void runLookupText(lookupTextState.mode, lookupTextState.term)}
            >
              다시 조회
            </button>
            <button
              type="button"
              className="rounded-lg border border-[color:var(--border)] px-2 py-1 text-xs"
              onClick={() => openLookupExternal(lookupTextState.mode, lookupTextState.term)}
            >
              원문 열기
            </button>
            <button
              type="button"
              className="rounded-lg border border-[color:var(--border)] px-2 py-1 text-xs"
              onClick={() => {
                lookupRequestSeqRef.current += 1;
                setLookupTextState(null);
              }}
            >
              닫기
            </button>
          </div>
        </div>

        {lookupTextState.status === 'loading' || lookupTextState.refreshing ? (
          <div className="mt-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-soft)] p-3 text-sm text-[color:var(--text-muted)]">
            {lookupTextState.refreshing ? '최신 텍스트로 갱신 중...' : '텍스트 조회 중...'}
          </div>
        ) : null}

        {lookupTextState.status === 'error' ? (
          <div className="mt-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-soft)] p-3 text-sm text-[color:var(--danger)]">
            조회 실패: {lookupTextState.error ?? '알 수 없는 오류'}
          </div>
        ) : null}

        {lookupTextState.status === 'loaded' ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-[color:var(--text-muted)]">
              원문 URL: {lookupTextState.sourceUrl}
            </p>
            {lookupTextState.viaProxy ? (
              <p className="text-xs text-[color:var(--text-muted)]">
                직접 접근이 제한되어 텍스트 프록시 경로를 사용했습니다.
              </p>
            ) : null}
            {lookupTextState.refreshing ? (
              <p className="text-xs text-[color:var(--text-muted)]">캐시 결과를 먼저 표시 중입니다.</p>
            ) : null}
            {!quickMeaningDraft ? (
              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-soft)] p-3 text-sm text-[color:var(--text-muted)]">
                검색 결과가 없습니다. 오타일 수 있으니 철자를 확인하거나 다른 엔진(네이버/다음)으로 다시 조회해보세요.
              </div>
            ) : null}
            <div className="surface rounded-lg p-3">
              <p className="text-xs font-medium text-[color:var(--text-muted)]">단어장 바로 추가</p>
              <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
                <textarea
                  value={quickMeaningDraft}
                  onChange={(event) => setQuickMeaningDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      void handleQuickAddFromLookup();
                    }
                  }}
                  placeholder="주요 뜻 전체를 확인/수정 후 저장"
                  className="surface min-h-24 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={!quickMeaningDraft.trim()}
                  className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void handleQuickAddFromLookup()}
                >
                  단어장 저장
                </button>
              </div>
              <p className="mt-1 text-xs text-[color:var(--text-muted)]">팁: `Cmd/Ctrl + Enter`로 바로 저장</p>
            </div>
            <pre className="max-h-[52vh] overflow-auto whitespace-pre-wrap rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-soft)] p-3 text-sm leading-relaxed">
              {lookupTextState.text}
            </pre>
          </div>
        ) : null}
      </div>
    );
  };

  const renderSearchResults = () => {
    if (!debouncedQuery.trim()) {
      return null;
    }

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[color:var(--text-muted)]">로컬 검색 결과</h2>
          <span className="text-xs text-[color:var(--text-muted)]">{searchResults.length}건</span>
        </div>

        {shouldShowUndefinedActions ? (
          <div className="surface rounded-xl p-3">
            <p className="text-sm text-[color:var(--text-muted)]">
              저장된 뜻이 없습니다. 필요할 때만 텍스트 조회를 실행하거나 직접 뜻을 저장하세요.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-medium text-white"
                onClick={() => void runLookupText('dictionary', debouncedQuery.trim())}
              >
                {dictionaryProvider?.name ?? '사전'} 텍스트 조회
              </button>
              <button
                type="button"
                className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm"
                onClick={() => void runLookupText('search', debouncedQuery.trim())}
              >
                {searchProvider?.name ?? '검색'} 텍스트 조회
              </button>
              <button
                type="button"
                className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm"
                onClick={handleOpenSaveModalFromQuery}
              >
                뜻 저장
              </button>
            </div>
          </div>
        ) : null}

        {lookupTextState && normalizeTerm(lookupTextState.term) === normalizeTerm(debouncedQuery)
          ? renderLookupTextPanel()
          : null}

        {academicAbbrevSuggestions.length > 0 ? (
          <div className="surface rounded-xl p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">학술 약어 추천</h3>
              <span className="text-xs text-[color:var(--text-muted)]">{academicAbbrevSuggestions.length}건</span>
            </div>
            <div className="space-y-2">
              {academicAbbrevSuggestions.map((suggestion) => (
                <div
                  key={`${suggestion.abbr}-${suggestion.fullExpansion}`}
                  className="rounded-lg border border-[color:var(--border)] p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {suggestion.fullExpansion && suggestion.fullExpansion !== suggestion.abbr
                          ? `${suggestion.abbr} - ${suggestion.fullExpansion}`
                          : suggestion.abbr}
                      </p>
                      <p className="text-sm text-[color:var(--text-muted)]">{suggestion.meaningKo}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {suggestion.domains.map((domain) => (
                          <span key={domain} className="chip">
                            {domain}
                          </span>
                        ))}
                        {suggestion.sourceUrl ? (
                          <a
                            href={suggestion.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="chip chip-brand"
                            onClick={(event) => event.stopPropagation()}
                          >
                            ktword 원문 ↗
                          </a>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost text-xs"
                      onClick={() => void handleAddAcademicSuggestion(suggestion)}
                    >
                      단어장 추가
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {academicWordSuggestions.length > 0 ? (
          <div className="surface rounded-xl p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">학술 단어 추천</h3>
              <span className="text-xs text-[color:var(--text-muted)]">{academicWordSuggestions.length}건</span>
            </div>
            <div className="space-y-2">
              {academicWordSuggestions.map((suggestion) => (
                <div
                  key={suggestion.term}
                  className="rounded-lg border border-[color:var(--border)] p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{suggestion.term}</p>
                      <p className="text-sm text-[color:var(--text-muted)]">{suggestion.meaningKo}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {suggestion.domains.map((domain) => (
                          <span
                            key={domain}
                            className="rounded bg-[color:var(--surface-soft)] px-2 py-0.5 text-xs"
                          >
                            {domain}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg border border-[color:var(--border)] px-3 py-1 text-xs"
                      onClick={() => void handleAddAcademicWordSuggestion(suggestion)}
                    >
                      단어장 추가
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          {searchResults.map((result) => (
            <button
              type="button"
              key={result.entry.stableKey}
              onClick={() => setSelectedStableKey(result.entry.stableKey)}
              className="surface w-full rounded-xl p-3 text-left transition hover:border-[color:var(--brand)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    {result.entry.term}{' '}
                    <span className="text-xs font-normal text-[color:var(--text-muted)]">
                      [{result.entry.type}]
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--text-muted)]">
                    {buildMeaningPreview(result.entry, settings.domains)}
                  </p>
                </div>
                {result.entry.favorite ? (
                  <span className="rounded-md bg-[color:var(--brand-soft)] px-2 py-1 text-xs text-[color:var(--brand)]">
                    favorite
                  </span>
                ) : null}
              </div>
            </button>
          ))}

          {searchResults.length === 0 &&
          academicAbbrevSuggestions.length === 0 &&
          academicWordSuggestions.length === 0 ? (
            <div className="surface rounded-xl p-4 text-sm text-[color:var(--text-muted)]">
              검색 결과가 없습니다. 철자를 확인하거나 사전 엔진을 바꿔보세요.
            </div>
          ) : null}
        </div>
      </section>
    );
  };

  const renderHistoryPanel = () => (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-[color:var(--text-muted)]">최근 검색</h2>
      {history.map((item) => (
        <button
          type="button"
          key={item.termNorm}
          onClick={() => {
            setQuery(item.term);
            searchRef.current?.focus();
          }}
          className="surface flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:border-[color:var(--brand)]"
        >
          <div>
            <p className="text-sm">{item.term}</p>
            <p className="text-xs text-[color:var(--text-muted)]">{formatDateTime(item.lastSeenAt)}</p>
          </div>
          <span className="rounded-md bg-[color:var(--surface-soft)] px-2 py-1 text-xs">{item.seenCount}회</span>
        </button>
      ))}

      {history.length === 0 ? (
        <div className="surface rounded-lg p-4 text-sm text-[color:var(--text-muted)]">아직 검색 기록이 없습니다.</div>
      ) : null}
    </section>
  );

  const renderWordbookPanel = () => (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['recent', '최근'],
            ['frequent', '자주'],
            ['favorite', '즐겨찾기'],
            ['tag', '태그'],
            ['undefined', '미정의']
          ] as const
        ).map(([key, label]) => (
          <button
            type="button"
            key={key}
            onClick={() => setWordbookFilter(key)}
            className={`rounded-lg px-3 py-1 text-sm ${
              wordbookFilter === key
                ? 'bg-[color:var(--brand)] text-white'
                : 'border border-[color:var(--border)] bg-[color:var(--surface)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {wordbookFilter === 'tag' ? (
        <select
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
          className="surface w-full rounded-lg px-3 py-2 text-sm"
        >
          <option value="">태그 선택</option>
          {allTags.map((tag) => (
            <option value={tag} key={tag}>
              {tag}
            </option>
          ))}
        </select>
      ) : null}

      <div className="space-y-2">
        {filteredWordEntries.map((entry) => (
          <button
            type="button"
            key={entry.stableKey}
            onClick={() => setSelectedStableKey(entry.stableKey)}
            className="surface w-full rounded-xl p-3 text-left hover:border-[color:var(--brand)]"
          >
            <div className="flex items-start justify-between">
              <p className="text-sm font-semibold">{entry.term}</p>
              <span className="text-xs text-[color:var(--text-muted)]">{formatDateTime(entry.updatedAt)}</span>
            </div>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">
              {entry.meaningKo?.trim() || '뜻 미정의'}
            </p>
            {entry.tags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {entry.tags.map((tag) => (
                  <span key={tag} className="rounded bg-[color:var(--surface-soft)] px-2 py-0.5 text-xs">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );

  const renderAbbrevPanel = () => (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-[color:var(--text-muted)]">약어 다의성</h2>
      {abbrEntries.map((entry) => {
        const ranked = rankAbbrExpansions(entry, settings.domains);

        return (
          <div key={entry.stableKey} className="surface rounded-xl p-3">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                className="text-left text-sm font-semibold"
                onClick={() => setSelectedStableKey(entry.stableKey)}
              >
                {entry.term}
              </button>
              <button
                type="button"
                className="rounded-md border border-[color:var(--border)] px-2 py-1 text-xs"
                onClick={() => handleOpenSaveModalFromEntry(entry)}
              >
                뜻 저장
              </button>
            </div>

            {ranked.length === 0 ? (
              <p className="text-sm text-[color:var(--text-muted)]">확장 의미가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {ranked.map((expansion) => {
                  const pinned = entry.priorityExpansionId === expansion.id;
                  return (
                    <li key={expansion.id} className="rounded-lg border border-[color:var(--border)] p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{expansion.fullExpansion}</p>
                          <p className="text-sm text-[color:var(--text-muted)]">
                            {expansion.meaningKo?.trim() || '뜻 미정의'}
                          </p>
                        </div>
                        <button
                          type="button"
                          className={`rounded px-2 py-1 text-xs ${
                            pinned
                              ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
                              : 'border border-[color:var(--border)]'
                          }`}
                          onClick={() => handlePinExpansion(entry, expansion.id)}
                        >
                          {pinned ? '기본 의미' : '기본 의미로 고정'}
                        </button>
                      </div>
                      {expansion.domains.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {expansion.domains.map((domain) => (
                            <span
                              key={domain}
                              className="rounded bg-[color:var(--surface-soft)] px-2 py-0.5 text-xs"
                            >
                              {domain}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      {abbrEntries.length === 0 ? (
        <div className="surface rounded-lg p-4 text-sm text-[color:var(--text-muted)]">약어 데이터가 없습니다.</div>
      ) : null}
    </section>
  );

  const renderReviewPanel = () => {
    if (!currentReview) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[color:var(--border)] p-10 text-center">
          <span className="text-3xl" aria-hidden="true">🎉</span>
          <p className="text-sm font-medium">리뷰 큐가 비어 있습니다.</p>
          <p className="text-xs text-[color:var(--text-muted)]">
            뜻이 없는 단어를 추가하거나 Import 하면 여기에서 한 번에 채울 수 있어요.
          </p>
          <button type="button" className="btn btn-ghost" onClick={() => syncPanelRoute('wordbook')}>
            단어장으로 가기
          </button>
        </div>
      );
    }

    const targetEntry = liveEntries.find((entry) => entry.stableKey === currentReview.stableKey);

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between" role="status" aria-live="polite">
          <h2 className="text-sm font-semibold text-[color:var(--text-muted)]">Review Queue</h2>
          <span className="chip">
            {reviewIndex + 1} / {reviewQueue.length}
          </span>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--surface-soft)]">
          <div
            className="h-full rounded-full bg-[color:var(--brand)] transition-all"
            style={{ width: `${((reviewIndex + 1) / Math.max(1, reviewQueue.length)) * 100}%` }}
          />
        </div>

        <div className="surface rounded-2xl p-4">
          <p className="text-base font-semibold">{currentReview.label}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void runLookupText('dictionary', currentReview.term)}
            >
              사전 조회
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (targetEntry) {
                  handleOpenSaveModalFromEntry(targetEntry, currentReview);
                }
              }}
            >
              상세 저장 모달
            </button>
          </div>

          <label htmlFor="review-meaning-input" className="mt-4 block text-sm font-medium">
            뜻 (meaningKo)
          </label>
          <input
            id="review-meaning-input"
            ref={reviewInputRef}
            value={reviewMeaning}
            onChange={(event) => setReviewMeaning(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleSaveReviewMeaning();
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                goToNextReview();
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                goToPrevReview();
              }
            }}
            placeholder="뜻 입력 후 Enter로 저장 · ↑↓ 로 이동"
            className="field mt-1 w-full rounded-lg px-3 py-2"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void handleSaveReviewMeaning()}>
              저장 후 다음
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={goToPrevReview}
              disabled={reviewIndex === 0}
            >
              이전
            </button>
            <button type="button" className="btn btn-ghost" onClick={goToNextReview}>
              건너뛰기
            </button>
          </div>
        </div>
      </section>
    );
  };

  const updateProvider = (providerId: string, patch: Partial<SearchProvider>) => {
    setSettings((prev) => ({
      ...prev,
      providers: prev.providers.map((provider) =>
        provider.id === providerId ? { ...provider, ...patch } : provider
      )
    }));
  };

  const renderSettingsPanel = () => (
    <section className="space-y-6">
      <div className="surface flex flex-wrap items-center justify-between gap-3 rounded-xl p-4">
        <div>
          <h2 className="text-sm font-semibold">앱 사용법이 처음이신가요?</h2>
          <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">핵심 기능을 30초 가이드로 다시 볼 수 있어요.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowOnboarding(true)}>
          가이드 다시 보기
        </button>
      </div>

      <div className="surface rounded-xl p-4">
        <h2 className="text-sm font-semibold">Theme</h2>
        <div className="mt-2 flex gap-2">
          {(['light', 'dark', 'system'] as const).map((theme) => (
            <button
              type="button"
              key={theme}
              onClick={() => setSettings((prev) => ({ ...prev, theme }))}
              className={`rounded-lg px-3 py-2 text-sm ${
                settings.theme === theme
                  ? 'bg-[color:var(--brand)] text-white'
                  : 'border border-[color:var(--border)]'
              }`}
            >
              {theme}
            </button>
          ))}
        </div>
      </div>

      <div className="surface rounded-xl p-4">
        <h2 className="text-sm font-semibold">관심 분야 (우선 정렬)</h2>
        <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
          관심 분야를 등록하면 약어/검색 추천에서 해당 도메인 항목이 위로 정렬됩니다. (예: 통신 전공 →
          comm, wireless)
        </p>

        {settings.domains.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {settings.domains.map((domain) => (
              <button
                key={domain}
                type="button"
                className="chip chip-brand"
                title="클릭하여 제거"
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    domains: prev.domains.filter((item) => item !== domain)
                  }))
                }
              >
                {domain} ✕
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-[color:var(--text-muted)]">아직 등록된 분야가 없습니다.</p>
        )}

        <div className="mt-2 flex gap-2">
          <input
            value={domainInput}
            onChange={(event) => setDomainInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                const adds = normalizeListField(domainInput);
                if (adds.length > 0) {
                  setSettings((prev) => ({
                    ...prev,
                    domains: Array.from(new Set([...prev.domains, ...adds]))
                  }));
                }
                setDomainInput('');
              }
            }}
            placeholder="분야 입력 후 Enter (쉼표로 여러 개)"
            className="field w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {['comm', 'wireless', '5g', 'rf', 'dsp', 'signals', 'ee', 'circuit', 'device', 'optical', 'network', 'math', 'physics']
            .filter((domain) => !settings.domains.includes(domain))
            .map((domain) => (
              <button
                key={domain}
                type="button"
                className="chip"
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    domains: Array.from(new Set([...prev.domains, domain]))
                  }))
                }
              >
                + {domain}
              </button>
            ))}
        </div>
      </div>

      <div className="surface rounded-xl p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Search Providers</h2>
          <button
            type="button"
            className="rounded-lg border border-[color:var(--border)] px-2 py-1 text-xs"
            onClick={() =>
              setSettings((prev) => ({
                ...prev,
                providers: [...prev.providers, createProvider()]
              }))
            }
          >
            제공자 추가
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {settings.providers.map((provider) => (
            <div key={provider.id} className="rounded-lg border border-[color:var(--border)] p-3">
              <div className="grid gap-2 md:grid-cols-2">
                <input
                  value={provider.name}
                  onChange={(event) => updateProvider(provider.id, { name: event.target.value })}
                  className="surface rounded-md px-2 py-1 text-sm"
                  placeholder="Provider name"
                />
                <select
                  value={provider.kind}
                  onChange={(event) =>
                    updateProvider(provider.id, {
                      kind: event.target.value as SearchProvider['kind']
                    })
                  }
                  className="surface rounded-md px-2 py-1 text-sm"
                >
                  <option value="search">search</option>
                  <option value="dictionary">dictionary</option>
                </select>
              </div>

              <input
                value={provider.template}
                onChange={(event) => updateProvider(provider.id, { template: event.target.value })}
                className="surface mt-2 w-full rounded-md px-2 py-1 text-sm"
                placeholder="https://...{query}"
              />

              <label className="mt-2 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={provider.enabled}
                  onChange={(event) => updateProvider(provider.id, { enabled: event.target.checked })}
                />
                활성화
              </label>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <label className="text-xs">
            기본 사전
            <select
              value={settings.dictionaryProviderId}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  dictionaryProviderId: event.target.value
                }))
              }
              className="surface mt-1 w-full rounded-md px-2 py-1 text-sm"
            >
              {settings.providers
                .filter((provider) => provider.kind === 'dictionary')
                .map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="text-xs">
            기본 검색
            <select
              value={settings.searchProviderId}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  searchProviderId: event.target.value
                }))
              }
              className="surface mt-1 w-full rounded-md px-2 py-1 text-sm"
            >
              {settings.providers
                .filter((provider) => provider.kind === 'search')
                .map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="text-xs">
            자동완성 소스
            <select
              value={settings.autocompleteSource}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  autocompleteSource: event.target.value as AppSettings['autocompleteSource']
                }))
              }
              className="surface mt-1 w-full rounded-md px-2 py-1 text-sm"
            >
              <option value="dictionary">사전 기반</option>
              <option value="search">검색엔진 기반</option>
            </select>
          </label>
        </div>
      </div>

      <div className="surface rounded-xl p-4">
        <h2 className="text-sm font-semibold">Domains / Shortcuts</h2>
        <label className="mt-2 block text-xs">
          관심 분야(domains, comma)
          <input
            value={settings.domains.join(', ')}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                domains: normalizeListField(event.target.value)
              }))
            }
            className="surface mt-1 w-full rounded-md px-2 py-1 text-sm"
          />
        </label>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {(Object.keys(settings.shortcuts) as (keyof typeof settings.shortcuts)[]).map((key) => (
            <label key={key} className="text-xs">
              {key}
              <input
                value={settings.shortcuts[key]}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    shortcuts: {
                      ...prev.shortcuts,
                      [key]: event.target.value
                    }
                  }))
                }
                className="surface mt-1 w-full rounded-md px-2 py-1 text-sm"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="surface rounded-xl p-4">
        <div className="flex items-center gap-2">
          <span className="text-base">🤖</span>
          <h2 className="text-sm font-semibold">LLM로 논문 단어 가져오기</h2>
        </div>
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">
          ① 아래 프롬프트를 복사해 ChatGPT·Claude에 <b>논문/문단과 함께</b> 붙여넣고 → ② 나온 JSON을
          그대로 복사해 아래 칸에 붙여넣은 뒤 <b>가져오기</b>를 누르면 뜻까지 자동 저장됩니다.
        </p>

        <div className="mt-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-soft)] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[color:var(--text-muted)]">붙여넣을 프롬프트</span>
            <button type="button" className="btn btn-primary text-xs" onClick={() => void handleCopyPrompt()}>
              {promptCopied ? '복사됨 ✓' : '프롬프트 복사'}
            </button>
          </div>
          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-[color:var(--text-muted)]">
            {LLM_IMPORT_PROMPT}
          </pre>
        </div>

        <textarea
          value={llmText}
          onChange={(event) => setLlmText(event.target.value)}
          placeholder='LLM이 출력한 JSON 배열을 여기에 붙여넣기 → [{"term":"OFDM","meaningKo":"직교 주파수 분할 다중화",...}]'
          className="field mt-3 min-h-28 w-full rounded-lg px-3 py-2 text-sm"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!llmText.trim()}
            onClick={() => void handleLlmImport()}
          >
            LLM 결과 가져오기
          </button>
        </div>
      </div>

      <div className="surface rounded-xl p-4">
        <h2 className="text-sm font-semibold">Import / Export (CSV · 텍스트)</h2>

        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <select
            value={importMode}
            onChange={(event) => setImportMode(event.target.value as 'auto' | 'csv' | 'text')}
            className="surface rounded-md px-2 py-1 text-sm"
          >
            <option value="auto">Auto detect</option>
            <option value="csv">CSV</option>
            <option value="text">Plain text</option>
          </select>

          <input type="file" accept=".csv,.txt" onChange={(event) => void handleImportFile(event)} />

          <button
            type="button"
            className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm"
            onClick={() => void handleImportRows(importText)}
          >
            텍스트 가져오기
          </button>
        </div>

        <textarea
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          placeholder="CSV를 붙여넣거나 줄바꿈 term 리스트를 입력"
          className="surface mt-2 min-h-28 w-full rounded-lg px-3 py-2 text-sm"
        />

        {importWarnings.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-[color:var(--danger)]">
            {importWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm"
            onClick={handleExportWordCsv}
          >
            Wordbook CSV 내보내기
          </button>
          <button
            type="button"
            className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm"
            onClick={handleExportAbbrCsv}
          >
            Abbrev CSV 내보내기
          </button>
          <button
            type="button"
            className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm"
            onClick={() => void handleExportJson()}
          >
            전체 JSON 백업
          </button>
          <label className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm">
            JSON 복원
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => void handleRestoreJson(event)}
            />
          </label>
        </div>
      </div>

      <div className="surface rounded-xl p-4">
        <h2 className="text-sm font-semibold">Sync</h2>
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">
          권장 구성은 Vercel + Supabase 입니다. 로컬 IndexedDB는 즉시 조회용 캐시로 유지하고, 원하면 Supabase 또는 Gist로 백업/동기화할 수 있습니다.
        </p>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <label className="text-xs">
            모드
            <select
              value={settings.sync.mode}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  sync: {
                    ...prev.sync,
                    mode: event.target.value as 'local' | 'gist' | 'supabase'
                  }
                }))
              }
              className="surface mt-1 w-full rounded-md px-2 py-1 text-sm"
            >
              <option value="local">Sync OFF (Local only)</option>
              <option value="supabase">Supabase Sync ON</option>
              <option value="gist">GitHub Gist Sync ON (legacy)</option>
            </select>
          </label>

          {settings.sync.mode === 'gist' ? (
            <label className="text-xs">
              Gist ID
              <input
                value={settings.sync.gistId}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    sync: {
                      ...prev.sync,
                      gistId: event.target.value.trim()
                    }
                  }))
                }
                className="surface mt-1 w-full rounded-md px-2 py-1 text-sm"
                placeholder="예: 123abc..."
              />
            </label>
          ) : (
            <label className="text-xs">
              Supabase 로그인 상태
              <div className="surface mt-1 flex min-h-10 items-center rounded-md px-3 py-2 text-sm">
                {supabaseSession?.user.email ?? (settings.sync.mode === 'supabase' ? '로그인 필요' : '사용 안 함')}
              </div>
            </label>
          )}
        </div>

        {settings.sync.mode === 'supabase' ? (
          <div className="mt-3 space-y-3">
            {HAS_BUNDLED_SUPABASE && !showSyncAdvanced ? (
              <p className="rounded-lg bg-[color:var(--surface-soft)] p-2.5 text-xs text-[color:var(--text-muted)]">
                ✉️ 이메일만 입력하면 됩니다 — 받은 8자리 코드로 로그인하면 기기 간 자동 동기화돼요.
              </p>
            ) : null}

            {showSyncAdvanced ? (
              <div className="grid gap-2 md:grid-cols-2">
              <label className="text-xs">
                Supabase Project URL
                <input
                  value={settings.sync.supabase.url}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      sync: {
                        ...prev.sync,
                        supabase: {
                          ...prev.sync.supabase,
                          url: event.target.value.trim()
                        }
                      }
                    }))
                  }
                  className="surface mt-1 w-full rounded-md px-2 py-1 text-sm"
                  placeholder="https://xxxx.supabase.co"
                />
              </label>

              <label className="text-xs">
                Supabase anon key
                <input
                  value={settings.sync.supabase.anonKey}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      sync: {
                        ...prev.sync,
                        supabase: {
                          ...prev.sync.supabase,
                          anonKey: event.target.value.trim()
                        }
                      }
                    }))
                  }
                  className="surface mt-1 w-full rounded-md px-2 py-1 text-sm"
                  placeholder="eyJ..."
                />
              </label>
              </div>
            ) : null}

            <div className="grid gap-2 md:grid-cols-2">
              <label className="text-xs">
                로그인 이메일
                <input
                  type="email"
                  value={settings.sync.supabase.email}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      sync: {
                        ...prev.sync,
                        supabase: {
                          ...prev.sync.supabase,
                          email: event.target.value.trim()
                        }
                      }
                    }))
                  }
                  className="surface mt-1 w-full rounded-md px-2 py-1 text-sm"
                  placeholder="you@example.com"
                />
              </label>

              <label className="text-xs">
                이메일 OTP
                <input
                  value={supabaseOtp}
                  onChange={(event) => setSupabaseOtp(event.target.value.trim())}
                  className="surface mt-1 w-full rounded-md px-2 py-1 text-sm"
                  placeholder="8자리 코드"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={settings.sync.supabase.rememberSession}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    sync: {
                      ...prev.sync,
                      supabase: {
                        ...prev.sync.supabase,
                        rememberSession: event.target.checked
                      }
                    }
                  }))
                }
              />
              이 기기에서 Supabase 세션 기억하기
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm text-white disabled:opacity-60"
                disabled={syncBusy || !hasSupabaseConfig || !settings.sync.supabase.email.trim()}
                onClick={() => void handleSendSupabaseOtp()}
              >
                인증 코드 보내기
              </button>
              <button
                type="button"
                className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm disabled:opacity-60"
                disabled={syncBusy || !supabaseOtp.trim()}
                onClick={() => void handleVerifySupabaseOtp()}
              >
                OTP 확인 후 연결
              </button>
              <button
                type="button"
                className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm disabled:opacity-60"
                disabled={syncBusy || !supabaseSession}
                onClick={() => void handleSyncNow()}
              >
                Sync now
              </button>
              <button
                type="button"
                className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm disabled:opacity-60"
                disabled={syncBusy || !supabaseSession}
                onClick={() => void handleSupabaseSignOut()}
              >
                Sign out
              </button>
              <button
                type="button"
                className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm disabled:opacity-60"
                disabled={syncBusy}
                onClick={handleDisconnectSync}
              >
                Disconnect
              </button>
              {HAS_BUNDLED_SUPABASE ? (
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-sm text-[color:var(--text-muted)] underline-offset-2 hover:underline"
                  onClick={() => setShowSyncAdvanced((prev) => !prev)}
                >
                  {showSyncAdvanced ? '고급 설정 숨기기' : '고급 (직접 Supabase 연결)'}
                </button>
              ) : null}
            </div>

            <p className="text-xs text-[color:var(--text-muted)]">
              Supabase는 `sync_vaults` 테이블 1개만 사용하도록 설계했습니다. 브라우저는 로컬 IndexedDB를 먼저 쓰고, Sync 시에만 원격 vault와 병합합니다.
            </p>
          </div>
        ) : null}

        {settings.sync.mode === 'gist' ? (
          <div className="mt-3 space-y-3">
            <label className="block text-xs">
              GitHub Personal Access Token (gist)
              <input
                type="password"
                value={syncToken}
                onChange={(event) => setSyncToken(event.target.value)}
                className="surface mt-1 w-full rounded-md px-2 py-1 text-sm"
                placeholder="ghp_..."
              />
            </label>

            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={settings.sync.rememberToken}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    sync: {
                      ...prev.sync,
                      rememberToken: event.target.checked
                    }
                  }))
                }
              />
              이 기기 기억하기(localStorage), 기본은 sessionStorage
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm text-white disabled:opacity-60"
                disabled={syncBusy}
                onClick={() => void handleCreateGist()}
              >
                Create new private gist
              </button>
              <button
                type="button"
                className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm disabled:opacity-60"
                disabled={syncBusy}
                onClick={() => void handleConnectGist()}
              >
                Connect existing gist
              </button>
              <button
                type="button"
                className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm disabled:opacity-60"
                disabled={syncBusy}
                onClick={() => void handleSyncNow()}
              >
                Sync now
              </button>
              <button
                type="button"
                className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm disabled:opacity-60"
                disabled={syncBusy}
                onClick={handleDisconnectSync}
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : null}

        {syncMessage ? <p className="mt-2 text-xs text-[color:var(--text-muted)]">{syncMessage}</p> : null}
      </div>
    </section>
  );

  const renderMainPanel = () => {
    if (activePanel === 'history' && debouncedQuery.trim()) {
      return renderSearchResults();
    }

    let panelContent: JSX.Element;

    if (activePanel === 'history') {
      panelContent = renderHistoryPanel();
    } else if (activePanel === 'wordbook') {
      panelContent = renderWordbookPanel();
    } else if (activePanel === 'abbrev') {
      panelContent = renderAbbrevPanel();
    } else if (activePanel === 'review') {
      panelContent = renderReviewPanel();
    } else {
      panelContent = renderSettingsPanel();
    }

    return panelContent;
  };

  return (
    <div className="app-shell">
      <header className="surface glass sticky top-0 z-30 border-b px-3 py-3 lg:px-6">
        <div className="mx-auto flex w-full max-w-[1200px] items-center gap-3">
          <button
            type="button"
            onClick={goHome}
            data-tour="home"
            aria-label={`${APP_NAME} 홈으로`}
            title={`${APP_NAME} 홈`}
            className="hidden shrink-0 items-center gap-2 rounded-lg pr-1 transition hover:opacity-80 lg:flex"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color:var(--brand)] text-sm font-bold text-white shadow-sm">
              V
            </span>
            <span className="text-sm font-semibold tracking-tight">{APP_NAME}</span>
          </button>
          <div className="relative w-full" data-tour="search">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-muted)]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
            </svg>
            <input
              ref={searchRef}
              autoFocus
              value={query}
              type="search"
              role="combobox"
              aria-label="영단어/약어 검색"
              aria-expanded={autocompleteOpen && autocompleteSuggestions.length > 0}
              aria-controls="autocomplete-listbox"
              aria-autocomplete="list"
              aria-activedescendant={
                autocompleteIndex >= 0 ? `autocomplete-option-${autocompleteIndex}` : undefined
              }
              onChange={(event) => {
                const next = event.target.value;
                setQuery(next);
                setAutocompleteIndex(-1);
                setAutocompleteOpen(normalizeTerm(next).length >= 1);
              }}
              onFocus={() => {
                if (blurTimerRef.current !== null) {
                  window.clearTimeout(blurTimerRef.current);
                  blurTimerRef.current = null;
                }
                setIsSearchFocused(true);
                setAutocompleteOpen(normalizeTerm(query).length >= 1);
              }}
              onBlur={() => {
                setIsSearchFocused(false);
                if (blurTimerRef.current !== null) {
                  window.clearTimeout(blurTimerRef.current);
                }
                blurTimerRef.current = window.setTimeout(() => {
                  setAutocompleteOpen(false);
                  setAutocompleteIndex(-1);
                }, 120);
              }}
              onKeyDown={(event) => {
                const count = autocompleteSuggestions.length;
                if (event.key === 'ArrowDown' && count > 0) {
                  event.preventDefault();
                  setAutocompleteOpen(true);
                  setAutocompleteIndex((prev) => (prev >= count - 1 ? 0 : prev + 1));
                  return;
                }

                if (event.key === 'ArrowUp' && count > 0) {
                  event.preventDefault();
                  setAutocompleteOpen(true);
                  setAutocompleteIndex((prev) => (prev <= 0 ? count - 1 : prev - 1));
                  return;
                }

                if (event.key === 'Escape' && autocompleteOpen) {
                  event.preventDefault();
                  setAutocompleteOpen(false);
                  setAutocompleteIndex(-1);
                  return;
                }

                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (autocompleteOpen && autocompleteIndex >= 0 && autocompleteIndex < count) {
                    applyAutocompleteSuggestion(autocompleteSuggestions[autocompleteIndex], true);
                    return;
                  }
                  setAutocompleteOpen(false);
                  setAutocompleteIndex(-1);
                  handleSearchSubmit();
                }
              }}
              placeholder="영단어 · 약어 검색  ( / 로 포커스 )"
              className="field w-full rounded-xl py-2.5 pl-10 pr-4"
            />

            {isSearchFocused && autocompleteOpen && normalizeTerm(query).length >= 1 ? (
              <div
                id="autocomplete-listbox"
                role="listbox"
                className="surface popover absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 max-h-80 overflow-y-auto rounded-2xl p-1.5"
              >
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setAutocompleteOpen(false);
                    setAutocompleteIndex(-1);
                    handleSearchSubmit();
                  }}
                  className="mb-1 flex w-full items-center justify-between gap-3 rounded-xl bg-[color:var(--surface-soft)] px-3 py-2.5 text-left transition hover:bg-[color:var(--surface-strong)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      '{query.trim()}' 사전/검색에서 조회
                    </p>
                    <p className="truncate text-xs text-[color:var(--text-muted)]">
                      저장된 뜻이 없으면 앱 안에서 바로 뜻을 불러옵니다
                    </p>
                  </div>
                  <kbd className="kbd shrink-0">↵</kbd>
                </button>
                {autocompleteSuggestions.map((suggestion, index) => (
                  <div
                    id={`autocomplete-option-${index}`}
                    role="option"
                    aria-selected={index === autocompleteIndex}
                    key={`${suggestion.term}-${suggestion.source}-${index}`}
                    onMouseEnter={() => setAutocompleteIndex(index)}
                    className={`flex w-full items-center gap-1 rounded-xl pr-1.5 transition ${
                      index === autocompleteIndex
                        ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
                        : 'hover:bg-[color:var(--surface-soft)]'
                    }`}
                  >
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyAutocompleteSuggestion(suggestion, true)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2 text-left"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {suggestion.term}
                          {suggestion.meaningKo ? (
                            <span className="ml-2 font-normal text-[color:var(--text-muted)]">
                              {suggestion.meaningKo}
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-[color:var(--text-muted)]">{suggestion.subtitle}</p>
                      </div>
                      {suggestion.source === 'entry' ? (
                        <span className="chip chip-brand shrink-0">단어장</span>
                      ) : suggestion.source === 'daum' ? (
                        <span className="chip shrink-0">다음</span>
                      ) : suggestion.source === 'naver' ? (
                        <span className="chip shrink-0">네이버</span>
                      ) : (
                        <span className="chip shrink-0">사전</span>
                      )}
                    </button>
                    {suggestion.source !== 'entry' ? (
                      <button
                        type="button"
                        aria-label={`'${suggestion.term}' 단어장에 저장`}
                        title="단어장에 바로 저장"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => void handleQuickSaveSuggestion(suggestion)}
                        className="shrink-0 rounded-lg p-1.5 text-[color:var(--text-muted)] transition hover:bg-[color:var(--surface)] hover:text-[color:var(--brand)]"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                ))}
                {liveLoading ? (
                  <p className="flex items-center gap-2 px-3 py-2 text-xs text-[color:var(--text-muted)]">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[color:var(--border)] border-t-[color:var(--brand)]" />
                    다음 사전에서 뜻 불러오는 중…
                  </p>
                ) : null}
                {!liveLoading && autocompleteSuggestions.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-[color:var(--text-muted)]">
                    {wordlistReady
                      ? "일치하는 추천이 없어요. Enter로 사전 조회하거나 '뜻 저장'으로 추가하세요."
                      : '사전을 불러오는 중...'}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="hidden items-center gap-2 xl:flex" data-tour="engines">
            <label className="text-xs text-[color:var(--text-muted)]">
              사전
              <select
                value={settings.dictionaryProviderId}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    dictionaryProviderId: event.target.value
                  }))
                }
                className="field ml-1 rounded-lg px-2 py-1 text-xs"
              >
                {dictionaryOptions.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[color:var(--text-muted)]">
              검색
              <select
                value={settings.searchProviderId}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    searchProviderId: event.target.value
                  }))
                }
                className="field ml-1 rounded-lg px-2 py-1 text-xs"
              >
                {searchOptions.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            aria-label="단축키 도움말"
            title="단축키 도움말 (?)"
            data-tour="help"
            className="icon-btn shrink-0"
            onClick={() => setHelpOpen(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 3" />
              <path d="M12 17h.01" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="설정"
            title="설정 (g s)"
            data-tour="settings"
            className="icon-btn shrink-0"
            onClick={() => syncPanelRoute('settings')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1200px] flex-1 gap-4 px-3 py-4 lg:px-6">
        <aside className="surface hidden w-48 shrink-0 rounded-2xl p-2 lg:block" data-tour="nav">
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <button
                type="button"
                key={item.key}
                onClick={() => syncPanelRoute(item.key)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                  activePanel === item.key
                    ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
                    : 'hover:bg-[color:var(--surface-soft)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="surface min-h-[70vh] flex-1 rounded-2xl p-4 lg:p-5">
          {loading ? (
            <div className="text-sm text-[color:var(--text-muted)]">로컬 데이터 로딩 중...</div>
          ) : (
            renderMainPanel()
          )}
        </main>

        <aside className="surface hidden w-[340px] shrink-0 self-start rounded-2xl p-4 lg:block">
          {selectedEntry ? (
            <EntryDetail
              entry={selectedEntry}
              preferredDomains={settings.domains}
              onClose={() => setSelectedStableKey('')}
              onEdit={(entry) => handleOpenSaveModalFromEntry(entry)}
              onLookup={(mode, term) => void runLookupText(mode, term)}
              onDelete={(entry) => void handleDeleteEntry(entry)}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-[color:var(--text-muted)]">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-8 w-8 opacity-40"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 5h16M4 12h16M4 19h10" />
              </svg>
              항목을 선택하면 상세 정보가 표시됩니다.
            </div>
          )}
        </aside>
      </div>

      <nav className="surface glass fixed bottom-0 left-0 right-0 z-50 border-t p-2 lg:hidden" data-tour="nav">
        <div className="mx-auto flex max-w-[1200px] gap-1.5 overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.key}
              aria-current={activePanel === item.key ? 'page' : undefined}
              onClick={() => syncPanelRoute(item.key)}
              className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition ${
                activePanel === item.key
                  ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
                  : 'text-[color:var(--text-muted)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {isMobile && selectedEntry ? (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/30 lg:hidden"
            onClick={() => setSelectedStableKey('')}
          />
          <div className="surface popover fixed inset-x-0 bottom-[4.25rem] z-40 max-h-[62vh] overflow-y-auto rounded-t-3xl border-t p-4 lg:hidden">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[color:var(--border)]" />
            <EntryDetail
              entry={selectedEntry}
              preferredDomains={settings.domains}
              onClose={() => setSelectedStableKey('')}
              onEdit={(entry) => handleOpenSaveModalFromEntry(entry)}
              onLookup={(mode, term) => void runLookupText(mode, term)}
              onDelete={(entry) => void handleDeleteEntry(entry)}
            />
          </div>
        </>
      ) : null}

      {meaningModal ? (
        <Modal
          title={meaningModal.term.trim() ? `'${meaningModal.term.trim()}' 뜻 저장` : '뜻 저장'}
          titleId="meaning-modal-title"
          onClose={() => setMeaningModal(null)}
        >
            <div className="grid gap-2 md:grid-cols-2">
              <label className="text-sm">
                term
                <input
                  value={meaningModal.term}
                  onChange={(event) =>
                    setMeaningModal((prev) => (prev ? { ...prev, term: event.target.value } : prev))
                  }
                  className="field mt-1 w-full rounded-lg px-3 py-2"
                />
              </label>

              <label className="text-sm">
                type
                <select
                  value={meaningModal.type}
                  onChange={(event) =>
                    setMeaningModal((prev) =>
                      prev
                        ? {
                            ...prev,
                            type: event.target.value as EntryType
                          }
                        : prev
                    )
                  }
                  className="field mt-1 w-full rounded-lg px-3 py-2"
                >
                  <option value="word">word</option>
                  <option value="abbr">abbr</option>
                </select>
              </label>
            </div>

            {meaningModal.type === 'abbr' ? (
              <label className="mt-2 block text-sm">
                fullExpansion (선택)
                <input
                  value={meaningModal.fullExpansion}
                  onChange={(event) =>
                    setMeaningModal((prev) =>
                      prev ? { ...prev, fullExpansion: event.target.value } : prev
                    )
                  }
                  className="field mt-1 w-full rounded-lg px-3 py-2"
                />
              </label>
            ) : null}

            {meaningModal.type === 'abbr' ? (
              <label className="mt-2 block text-sm">
                domains (comma)
                <input
                  value={meaningModal.domains}
                  onChange={(event) =>
                    setMeaningModal((prev) => (prev ? { ...prev, domains: event.target.value } : prev))
                  }
                  className="field mt-1 w-full rounded-lg px-3 py-2"
                />
              </label>
            ) : null}

            <label className="mt-2 block text-sm">
              meaningKo (필수)
              <input
                value={meaningModal.meaningKo}
                onChange={(event) =>
                  setMeaningModal((prev) => (prev ? { ...prev, meaningKo: event.target.value } : prev))
                }
                className="field mt-1 w-full rounded-lg px-3 py-2"
              />
            </label>

            <label className="mt-2 block text-sm">
              tags (comma)
              <input
                value={meaningModal.tags}
                onChange={(event) =>
                  setMeaningModal((prev) => (prev ? { ...prev, tags: event.target.value } : prev))
                }
                className="field mt-1 w-full rounded-lg px-3 py-2"
              />
            </label>

            <label className="mt-2 block text-sm">
              notes
              <textarea
                value={meaningModal.notes}
                onChange={(event) =>
                  setMeaningModal((prev) => (prev ? { ...prev, notes: event.target.value } : prev))
                }
                className="field mt-1 min-h-20 w-full rounded-lg px-3 py-2"
              />
            </label>

            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={meaningModal.favorite}
                onChange={(event) =>
                  setMeaningModal((prev) => (prev ? { ...prev, favorite: event.target.checked } : prev))
                }
              />
              favorite
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setMeaningModal(null)}>
                취소
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void handleSaveMeaning()}>
                저장
              </button>
            </div>
        </Modal>
      ) : null}

      {isHelpOpen ? (
        <Modal
          title="단축키 도움말"
          titleId="help-modal-title"
          onClose={() => setHelpOpen(false)}
          widthClass="max-w-md"
        >
          <ul className="space-y-2 text-sm">
            {[
              ['/', '검색 포커스'],
              ['Esc', '닫기 / 블러 / 선택 해제'],
              ['?', '이 도움말 열기'],
              ['g h', 'History'],
              ['g w', 'Wordbook'],
              ['g a', 'Abbrev'],
              ['g r', 'Review Queue'],
              ['g s', 'Settings']
            ].map(([keys, label]) => (
              <li key={keys} className="flex items-center justify-between gap-3">
                <span className="text-[color:var(--text-muted)]">{label}</span>
                <span className="flex gap-1">
                  {keys.split(' ').map((key, index) => (
                    <kbd key={`${keys}-${index}`} className="kbd">
                      {key}
                    </kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Modal>
      ) : null}

      {showOnboarding ? <SpotlightTour onClose={dismissOnboarding} /> : null}

      {statusMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="surface popover fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-xl px-4 py-2 text-sm"
        >
          {statusMessage}
        </div>
      ) : null}
    </div>
  );
}

export default App;
