/**
 * Pier + district lookups via Nominatim (OSM geocoder), ≤ 1 request/second with an identifying
 * User-Agent (Nominatim usage policy). Piers: "<name> iskelesi" and "ferry terminal near <name>"
 * (special phrase → amenity=ferry_terminal around the place). Districts: "<name>".
 * Each query is logged with the catalog id it was for, so matching can stay local to that pier.
 * Output (raw, gitignored): data/raw/nominatim-istanbul.json in the same element shape as
 * Overpass, so build-piers.ts can match either source.
 *
 * Run: npm run data:fetch-nominatim
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DATA_BBOX } from './bbox';
import type { CatalogEntry } from './lib/match-places';
import { RAW_NOMINATIM, type OverpassElement } from './lib/overpass';

const UA = 'istanbul-living-map/0.0 (Phase 0 prototype data build; https://github.com/mutallimof/CityMap)';
const MIN_INTERVAL_MS = 1100;
const [w, s, e, n] = DATA_BBOX;

interface NominatimResult {
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
  lat: string;
  lon: string;
  category: string;
  type: string;
  name: string;
  extratags?: Record<string, string> | null;
  namedetails?: Record<string, string> | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(q: string): Promise<NominatimResult[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({
    q,
    format: 'jsonv2',
    viewbox: `${w},${n},${e},${s}`,
    bounded: '1',
    limit: '15',
    extratags: '1',
    namedetails: '1',
    'accept-language': 'tr',
  }).toString();
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for "${q}"`);
  return (await res.json()) as NominatimResult[];
}

function toElement(r: NominatimResult): OverpassElement {
  return {
    type: r.osm_type,
    id: r.osm_id,
    lat: Number(r.lat),
    lon: Number(r.lon),
    tags: { ...(r.extratags ?? {}), ...(r.namedetails ?? {}), [r.category]: r.type, name: r.namedetails?.name ?? r.name },
  };
}

async function main() {
  const piers = JSON.parse(readFileSync('data/catalog/piers.json', 'utf8')).piers as CatalogEntry[];
  const districts = JSON.parse(readFileSync('data/catalog/districts.json', 'utf8')).districts as CatalogEntry[];
  const queries: { forId: string; kind: 'pier' | 'district'; q: string }[] = [
    ...piers.flatMap((p) => [
      { forId: p.id, kind: 'pier' as const, q: `${p.tr} iskelesi` },
      { forId: p.id, kind: 'pier' as const, q: `ferry terminal near ${p.tr}` },
    ]),
    ...districts.map((d) => ({ forId: d.id, kind: 'district' as const, q: d.tr })),
  ];

  const byRef = new Map<string, OverpassElement>();
  const log: { forId: string; kind: string; q: string; refs: string[]; results: NominatimResult[] }[] = [];
  let last = 0;
  for (const { forId, kind, q } of queries) {
    const wait = last + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const results = await search(q);
    log.push({ forId, kind, q, refs: results.map((r) => `${r.osm_type}/${r.osm_id}`), results });
    for (const r of results) byRef.set(`${r.osm_type}/${r.osm_id}`, toElement(r));
    console.log(`  ${String(results.length).padStart(2)} × "${q}"`);
  }
  mkdirSync('data/raw', { recursive: true });
  writeFileSync(RAW_NOMINATIM, JSON.stringify({ fetchedAt: new Date().toISOString(), source: 'nominatim.openstreetmap.org', elements: [...byRef.values()], log }));
  console.log(`✓ ${byRef.size} distinct OSM features → ${RAW_NOMINATIM}. Next: npm run data:piers`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
