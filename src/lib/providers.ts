import type { SearchProvider } from '../types';

interface BuildProviderUrlInput {
  provider: SearchProvider;
  query: string;
  lang?: string;
}

export function buildProviderUrl({ provider, query, lang }: BuildProviderUrlInput): string {
  const encodedQuery = encodeURIComponent(query);
  const encodedLang = encodeURIComponent(lang ?? 'eng');

  return provider.template
    .replace(/\{query\}/g, encodedQuery)
    .replace(/\{lang\}/g, encodedLang);
}

export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
