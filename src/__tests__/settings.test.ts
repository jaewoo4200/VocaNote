import { afterEach, describe, expect, it } from 'vitest';
import { SETTINGS_STORAGE_KEY } from '../constants';
import { loadSettings } from '../lib/settings';

describe('settings migration', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('adds missing default providers and migrates old naver dictionary URL', () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        providers: [
          {
            id: 'daum-dictionary',
            name: 'Daum Dictionary',
            template: 'https://dic.daum.net/search.do?q={query}&dic={lang}',
            kind: 'dictionary',
            enabled: true
          },
          {
            id: 'naver-dictionary',
            name: 'Naver English Dictionary',
            template: 'https://en.dict.naver.com/#/search?query={query}',
            kind: 'dictionary',
            enabled: true
          }
        ],
        dictionaryProviderId: 'naver-dictionary'
      })
    );

    const settings = loadSettings();

    const naverDict = settings.providers.find((provider) => provider.id === 'naver-dictionary');
    const naverSearch = settings.providers.find((provider) => provider.id === 'naver-search');

    expect(naverDict?.template).toBe('https://search.naver.com/search.naver?where=dic&query={query}');
    expect(naverSearch).toBeTruthy();
    expect(settings.dictionaryProviderId).toBe('naver-dictionary');
    expect(settings.searchProviderId).toBeTruthy();
    expect(settings.autocompleteSource).toBe('dictionary');
  });

  it('adds supabase sync defaults to older settings payloads', () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        sync: {
          mode: 'supabase'
        }
      })
    );

    const settings = loadSettings();

    expect(settings.sync.mode).toBe('supabase');
    expect(settings.sync.supabase.url).toBe('');
    expect(settings.sync.supabase.anonKey).toBe('');
    expect(settings.sync.supabase.email).toBe('');
    expect(settings.sync.supabase.rememberSession).toBe(false);
  });
});
