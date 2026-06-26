// One-time, polite harvester for ktword.co.kr glossary data.
//
// ktword is http-only / EUC-KR / fragile PHP with no clean keyword API, so we do
// NOT crawl it live per lookup. Instead this build script fetches a BOUNDED set
// of its category list pages (via the r.jina.ai reader, which handles charset +
// rendering), extracts {term, ko, url} from the link titles, and writes
// public/ktword.json. Re-run to expand coverage.
//
// License: ktword states "본 웹사이트 내 모든 저작물은 원출처를 밝히는 한
// 자유롭게 사용(상업화포함) 가능합니다" — we keep the source URL on every entry
// and show attribution in the app.
//
// Usage:  node scripts/build-ktword.mjs [channels] [maxPagesPerChannel]
//   e.g.  node scripts/build-ktword.mjs 1,2,3 14

import { writeFile } from 'node:fs/promises';

const channels = (process.argv[2] ?? '1').split(',').map((s) => Number(s.trim())).filter(Boolean);
const maxPages = Number(process.argv[3] ?? 14);
const DELAY_MS = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function jinaUrl(ch, p) {
  return `https://r.jina.ai/http://www.ktword.co.kr/test/search/special_srch.php?ch=${ch}&p=${p}`;
}

// Markdown link: [Article Name](http://...view.php?no=123 "English Head, 한글뜻, ...")
const LINK_RE = /\[([^\]]+)\]\((http:\/\/www\.ktword\.co\.kr\/test\/view\/view\.php\?no=\d+)[^)]*"([^"]+)"\)/g;

const LATIN_RE = /^[A-Za-z0-9][A-Za-z0-9 .\/()+'-]*$/;

// Build a glossary seed from the link text (article name) + title (synonyms).
// abbr/full = English headword if present; ko = Korean synonyms (incl. name).
function toEntry(name, url, title) {
  const parts = title.split(',').map((s) => s.trim()).filter(Boolean);
  const english = parts.filter((p) => LATIN_RE.test(p) && /[A-Za-z]/.test(p));
  const korean = parts.filter((p) => /[가-힣]/.test(p));
  const koList = korean.length > 0 ? korean : [name];
  const ko = Array.from(new Set([name, ...koList])).filter((p) => /[가-힣]/.test(p)).slice(0, 5).join(', ');
  const head = english[0] ?? name;
  if (!head || !ko) return null;
  return { abbr: head, full: english[0] ?? '', ko, domains: ['ktword'], url };
}

async function fetchPage(ch, p) {
  const res = await fetch(jinaUrl(ch, p), { headers: { Accept: 'text/plain' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const byTerm = new Map();
for (const ch of channels) {
  for (let p = 1; p <= maxPages; p += 1) {
    let text;
    try {
      text = await fetchPage(ch, p);
    } catch (err) {
      console.error(`ch=${ch} p=${p} failed: ${err.message}`);
      break;
    }
    let count = 0;
    for (const m of text.matchAll(LINK_RE)) {
      const entry = toEntry(m[1].trim(), m[2].trim(), m[3].trim());
      if (!entry) continue;
      const key = entry.abbr.toLowerCase();
      if (!byTerm.has(key)) byTerm.set(key, entry);
      count += 1;
    }
    console.error(`ch=${ch} p=${p}: +${count} (total ${byTerm.size})`);
    if (count === 0) break; // past the last page
    await sleep(DELAY_MS);
  }
}

const out = [...byTerm.values()].sort((a, b) => a.abbr.localeCompare(b.abbr));
await writeFile(new URL('../public/ktword.json', import.meta.url), JSON.stringify(out, null, 0));
console.error(`\nWrote public/ktword.json with ${out.length} entries.`);
