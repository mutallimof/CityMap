/**
 * Pinned OSM features of chosen catalog piers via Nominatim's lookup (one request, identifying
 * User-Agent): the operator piers (data/catalog/piers.json entries with an "operator") or the ids given.
 * Output (raw, gitignored): data/raw/nominatim-lookup.json, same element shape as the Nominatim search
 * dump (centroid lat/lon, as build-piers.ts uses for every pier). Then: npm run data:piers -- --only=<ids>
 *
 * Run: npm run data:fetch-lookup [-- --only=eminonu-turyol,uskudar-dentur]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { CatalogEntry } from './lib/match-places';
import { RAW_LOOKUP, type OverpassElement } from './lib/overpass';

const UA = 'istanbul-living-map/0.0 (Phase 0 prototype data build; https://github.com/mutallimof/CityMap)';
type Entry = CatalogEntry & { operator?: string; berths?: { osm: string }[] };

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const piers = (JSON.parse(readFileSync('data/catalog/piers.json', 'utf8')).piers as Entry[]).filter((p) => (only ? only.includes(p.id) : !!p.operator));
const refs = [...new Set(piers.flatMap((p) => [p.osm, ...(p.berths ?? []).map((b) => b.osm)]).filter((r): r is string => !!r))];
if (!refs.length) throw new Error('no pinned OSM ids to look up');
const ids = refs.map((r) => r.replace(/^(node|way|relation)\//, (_, t: string) => t[0].toUpperCase()));
const url = `https://nominatim.openstreetmap.org/lookup?${new URLSearchParams({ osm_ids: ids.join(','), format: 'jsonv2', extratags: '1', namedetails: '1', 'accept-language': 'tr' })}`;
const res = await fetch(url, { headers: { 'User-Agent': UA } });
if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
const results = (await res.json()) as { osm_type: 'node' | 'way' | 'relation'; osm_id: number; lat: string; lon: string; category: string; type: string; name: string; extratags?: Record<string, string> | null; namedetails?: Record<string, string> | null }[];
const elements: OverpassElement[] = results.map((r) => ({
  type: r.osm_type,
  id: r.osm_id,
  lat: Number(r.lat),
  lon: Number(r.lon),
  tags: { ...(r.extratags ?? {}), ...(r.namedetails ?? {}), [r.category]: r.type, name: r.namedetails?.name ?? r.name },
}));
const missing = refs.filter((r) => !elements.some((e) => `${e.type}/${e.id}` === r));
mkdirSync('data/raw', { recursive: true });
writeFileSync(RAW_LOOKUP, JSON.stringify({ fetchedAt: new Date().toISOString(), source: 'nominatim.openstreetmap.org/lookup', elements }, null, 1));
for (const e of elements) console.log(`  ${e.type}/${e.id}  "${e.tags?.name}"  ${e.lat}, ${e.lon}  operator=${e.tags?.operator ?? ''}`);
if (missing.length) console.warn(`✗ not returned: ${missing.join(', ')}`);
console.log(`✓ ${elements.length} features → ${RAW_LOOKUP}`);
