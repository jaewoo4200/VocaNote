// Local English word list for zero-latency prefix autocomplete.
//
// The asset (`public/wordlist.txt`) is a newline-separated list of ~50k words
// ordered by descending corpus frequency. We index it once into first-character
// and first-two-character buckets (each kept in frequency order), so a prefix
// query is a bounded scan over a single bucket — fully synchronous and instant.

let ready = false;
let loadPromise: Promise<void> | null = null;
let oneCharBuckets = new Map<string, string[]>();
let twoCharBuckets = new Map<string, string[]>();

function pushTo(map: Map<string, string[]>, key: string, value: string): void {
  const bucket = map.get(key);
  if (bucket) {
    bucket.push(value);
  } else {
    map.set(key, [value]);
  }
}

/**
 * Build the in-memory prefix index from a frequency-ordered word list.
 * Exposed (and pure) so it can be unit-tested without fetching the asset.
 */
export function buildWordlistIndex(words: string[]): void {
  const one = new Map<string, string[]>();
  const two = new Map<string, string[]>();

  for (const raw of words) {
    const word = raw.trim().toLowerCase();
    if (!word) {
      continue;
    }
    pushTo(one, word[0], word);
    if (word.length >= 2) {
      pushTo(two, word.slice(0, 2), word);
    }
  }

  oneCharBuckets = one;
  twoCharBuckets = two;
  ready = true;
}

/**
 * Return up to `limit` dictionary words that start with `prefix`, most frequent
 * first. Returns an empty array if the list has not loaded yet (callers should
 * still surface the user's own wordbook matches in that case).
 */
export function queryWordlist(prefix: string, limit = 10): string[] {
  if (!ready || limit <= 0) {
    return [];
  }

  const normalized = prefix.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const bucket =
    normalized.length === 1
      ? oneCharBuckets.get(normalized)
      : twoCharBuckets.get(normalized.slice(0, 2));
  if (!bucket) {
    return [];
  }

  const out: string[] = [];
  for (const word of bucket) {
    if (word.startsWith(normalized)) {
      out.push(word);
      if (out.length >= limit) {
        break;
      }
    }
  }
  return out;
}

export function isWordlistReady(): boolean {
  return ready;
}

/**
 * Fetch and index the bundled word list. Idempotent: concurrent/repeat calls
 * share the same in-flight promise.
 */
export function loadWordlist(url: string): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`wordlist fetch failed (${response.status})`);
    }
    const text = await response.text();
    buildWordlistIndex(text.split('\n'));
  })();

  return loadPromise;
}
