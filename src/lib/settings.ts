import {
  DEFAULT_SETTINGS,
  LOCAL_SUPABASE_SESSION_KEY,
  LOCAL_TOKEN_KEY,
  SESSION_SUPABASE_SESSION_KEY,
  SESSION_TOKEN_KEY,
  SETTINGS_STORAGE_KEY
} from '../constants';
import type { AppSettings, SupabaseSession } from '../types';

function mergeProviders(parsedProviders: AppSettings['providers'] | undefined): AppSettings['providers'] {
  const defaults = DEFAULT_SETTINGS.providers;
  if (!parsedProviders || parsedProviders.length === 0) {
    return defaults;
  }

  const defaultMap = new Map(defaults.map((provider) => [provider.id, provider]));
  const merged = parsedProviders.map((provider) => {
    const defaultProvider = defaultMap.get(provider.id);
    if (!defaultProvider) {
      return provider;
    }

    // Migrate known broken Naver dictionary hash URL to server-renderable query URL.
    if (
      provider.id === 'naver-dictionary' &&
      typeof provider.template === 'string' &&
      provider.template.includes('#/search')
    ) {
      return {
        ...defaultProvider,
        ...provider,
        template: defaultProvider.template
      };
    }

    return {
      ...defaultProvider,
      ...provider
    };
  });

  for (const provider of defaults) {
    if (!merged.some((item) => item.id === provider.id)) {
      merged.push(provider);
    }
  }

  return merged;
}

function normalizeProviderSelection(
  providerId: string | undefined,
  providers: AppSettings['providers'],
  kind: 'dictionary' | 'search'
): string {
  if (providerId && providers.some((provider) => provider.id === providerId && provider.kind === kind)) {
    return providerId;
  }

  return (
    providers.find((provider) => provider.kind === kind && provider.enabled)?.id ??
    DEFAULT_SETTINGS.providers.find((provider) => provider.kind === kind)!.id
  );
}

function normalizeAutocompleteSource(
  source: AppSettings['autocompleteSource'] | undefined
): AppSettings['autocompleteSource'] {
  return source === 'search' ? 'search' : 'dictionary';
}

function parseSettings(raw: string): AppSettings {
  const parsed = JSON.parse(raw) as Partial<AppSettings>;
  const providers = mergeProviders(parsed.providers);

  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    sync: {
      ...DEFAULT_SETTINGS.sync,
      ...(parsed.sync ?? {}),
      supabase: {
        ...DEFAULT_SETTINGS.sync.supabase,
        ...(parsed.sync?.supabase ?? {})
      }
    },
    shortcuts: {
      ...DEFAULT_SETTINGS.shortcuts,
      ...(parsed.shortcuts ?? {})
    },
    providers,
    dictionaryProviderId: normalizeProviderSelection(parsed.dictionaryProviderId, providers, 'dictionary'),
    searchProviderId: normalizeProviderSelection(parsed.searchProviderId, providers, 'search'),
    autocompleteSource: normalizeAutocompleteSource(parsed.autocompleteSource)
  };
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    return parseSettings(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function getSyncToken(): string {
  return localStorage.getItem(LOCAL_TOKEN_KEY) ?? sessionStorage.getItem(SESSION_TOKEN_KEY) ?? '';
}

export function setSyncToken(token: string, remember: boolean): void {
  if (remember) {
    localStorage.setItem(LOCAL_TOKEN_KEY, token);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    return;
  }

  sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  localStorage.removeItem(LOCAL_TOKEN_KEY);
}

export function clearSyncToken(): void {
  localStorage.removeItem(LOCAL_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

export function getSupabaseSession(): SupabaseSession | null {
  try {
    const raw =
      localStorage.getItem(LOCAL_SUPABASE_SESSION_KEY) ?? sessionStorage.getItem(SESSION_SUPABASE_SESSION_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as SupabaseSession;
  } catch {
    return null;
  }
}

export function setSupabaseSession(session: SupabaseSession, remember: boolean): void {
  const raw = JSON.stringify(session);
  if (remember) {
    localStorage.setItem(LOCAL_SUPABASE_SESSION_KEY, raw);
    sessionStorage.removeItem(SESSION_SUPABASE_SESSION_KEY);
    return;
  }

  sessionStorage.setItem(SESSION_SUPABASE_SESSION_KEY, raw);
  localStorage.removeItem(LOCAL_SUPABASE_SESSION_KEY);
}

export function clearSupabaseSession(): void {
  localStorage.removeItem(LOCAL_SUPABASE_SESSION_KEY);
  sessionStorage.removeItem(SESSION_SUPABASE_SESSION_KEY);
}
