/**
 * Part B places from Nominatim (OSM): one request per catalog query, ≥ 2.5 s apart, identifying
 * User-Agent, exponential backoff on HTTP 429. Raw output (gitignored): data/raw/nominatim-places.json.
 *
 * Run: npm run data:fetch-places   then   npm run data:places
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DATA_BBOX } from './bbox';

const UA = 'istanbul-living-map/0.0 (Phase 0 prototype data build; https://github.com/mutallimof/CityMap)';
const INTERVAL_MS = 2500;
export const RAW_PLACES = 'data/raw/nominatim-places.json';
const [w, s, e, n] = DATA_BBOX;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Query {
  q: string;
  category: string;
  take: number;
}

async function search(q: string): Promise<unknown[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({
    q,
    format: 'jsonv2',
    viewbox: `${w},${n},${e},${s}`,
    bounded: '1',
    limit: '20',
    extratags: '1',
    namedetails: '1',
    addressdetails: '1',
    'accept-language': 'tr',
  }).toString();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 429 && attempt < 6) {
      const wait = 5000 * 2 ** attempt;
      console.warn(`  429 — backing off ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} for "${q}"`);
    return (await res.json()) as unknown[];
  }
}

async function main() {
  const queries = JSON.parse(readFileSync('data/catalog/place-queries.json', 'utf8')).queries as Query[];
  // Incremental: keep earlier results, only fetch queries we don't have yet (--refresh refetches all).
  const prev = existsSync(RAW_PLACES) && !process.argv.includes('--refresh') ? (JSON.parse(readFileSync(RAW_PLACES, 'utf8')).log as { q: string; results: unknown[] }[]) : [];
  const have = new Map(prev.map((l) => [l.q, l]));
  const log: { q: string; results: unknown[] }[] = [];
  for (const { q } of queries) {
    const cached = have.get(q);
    if (cached) {
      log.push(cached);
      continue;
    }
    const results = await search(q);
    log.push({ q, results });
    console.log(`  ${String(results.length).padStart(2)} × "${q}"`);
    await sleep(INTERVAL_MS);
  }
  mkdirSync('data/raw', { recursive: true });
  writeFileSync(RAW_PLACES, JSON.stringify({ fetchedAt: new Date().toISOString(), source: 'nominatim.openstreetmap.org', log }));
  console.log(`✓ ${log.length} queries → ${RAW_PLACES}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
