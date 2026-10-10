/**
 * Part B data: places (real, from OSM via Nominatim) + DEMO posts assigned to them.
 *   in:  data/raw/nominatim-places.json, data/catalog/place-queries.json, data/catalog/post-templates.json
 *   out: data/places.geojson, data/posts.json
 *
 * Run: npm run data:places
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as turf from '@turf/turf';
import { DATA_BBOX } from './bbox';
import { normName } from './lib/overpass';

interface Query {
  q: string;
  category: 'food' | 'culture' | 'shopping' | 'view';
  take: number;
  accept?: string[];
  label?: string;
}
interface NomResult {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  category: string;
  type: string;
  name: string;
  importance?: number;
  extratags?: Record<string, string> | null;
  namedetails?: Record<string, string> | null;
  address?: Record<string, string>;
}
interface Template {
  id: string;
  group: string;
  [k: string]: unknown;
}

const RAW = 'data/raw/nominatim-places.json';
const raw = JSON.parse(readFileSync(RAW, 'utf8')) as { log: { q: string; results: NomResult[] }[] };
const catalog = JSON.parse(readFileSync('data/catalog/place-queries.json', 'utf8')) as { queries: Query[]; exclude?: string[] };
const queries = catalog.queries;
const excluded = (name: string) => (catalog.exclude ?? []).some((x) => normName(name).includes(normName(x)));
const templates = JSON.parse(readFileSync('data/catalog/post-templates.json', 'utf8')).templates as Template[];
const byQ = new Map(raw.log.map((l) => [l.q, l.results]));
const [w, s, e, n] = DATA_BBOX;

const slug = (x: string) =>
  normName(x)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

function kindOf(r: NomResult, q: Query): string {
  const key = `${r.category}=${r.type}`;
  const map: Record<string, string> = {
    'amenity=theatre': 'theatre',
    'amenity=arts_centre': 'arts_centre',
    'amenity=concert_hall': 'concert_hall',
    'tourism=museum': 'museum',
    'tourism=gallery': 'gallery',
    'amenity=restaurant': 'restaurant',
    'amenity=cafe': 'cafe',
    'shop=mall': 'mall',
    'amenity=marketplace': 'bazaar',
    'tourism=viewpoint': 'viewpoint',
  };
  if (map[key]) return map[key];
  if (q.category === 'view') return 'viewpoint';
  if (q.category === 'shopping') return /çarşı|carsi|bazaar|market/i.test(r.name) ? 'bazaar' : 'mall';
  if (q.category === 'culture') return /müze|museum|modern/i.test(r.name) ? 'museum' : 'venue';
  return q.category === 'food' ? 'restaurant' : 'venue';
}

const GROUP: Record<string, string> = {
  theatre: 'stage',
  arts_centre: 'stage',
  concert_hall: 'stage',
  venue: 'stage',
  museum: 'museum',
  gallery: 'museum',
  restaurant: 'restaurant',
  cafe: 'cafe',
  mall: 'mall',
  bazaar: 'bazaar',
  viewpoint: 'view',
};

function score(r: NomResult): number {
  const t = r.extratags ?? {};
  return (t.opening_hours ? 2 : 0) + (t.wikidata ? 3 : 0) + (t.website ? 1 : 0) + Object.keys(t).length * 0.15 + (r.importance ?? 0) * 10;
}

const used = new Set<string>();
const usedNames = new Set<string>();
const places: GeoJSON.Feature<GeoJSON.Point>[] = [];
const report: string[] = [];

for (const q of queries) {
  const results = byQ.get(q.q);
  if (!results) {
    report.push(`  · "${q.q}": not fetched`);
    continue;
  }
  const accepted = results
    .filter((r) => (r.namedetails?.name ?? r.name)?.trim())
    .filter((r) => !excluded(r.namedetails?.name ?? r.name))
    .filter((r) => !q.accept || q.accept.includes(`${r.category}=${r.type}`))
    .filter((r) => {
      const lon = Number(r.lon);
      const lat = Number(r.lat);
      return lon > w && lon < e && lat > s && lat < n;
    })
    .filter((r) => !used.has(`${r.osm_type}/${r.osm_id}`) && !usedNames.has(normName(r.namedetails?.name ?? r.name)))
    .sort((a, b) => score(b) - score(a))
    .slice(0, q.take);
  for (const r of accepted) {
    const name = q.label ?? (r.namedetails?.name ?? r.name).trim();
    let id = slug(name) || `${r.osm_type}-${r.osm_id}`;
    while (places.some((p) => p.properties!.id === id)) id += '-2';
    used.add(`${r.osm_type}/${r.osm_id}`);
    usedNames.add(normName(name));
    const t = r.extratags ?? {};
    const a = r.address ?? {};
    const kind = kindOf(r, q);
    places.push(
      turf.point([Number(Number(r.lon).toFixed(6)), Number(Number(r.lat).toFixed(6))], {
        id,
        name,
        nameEn: r.namedetails?.['name:en'] ?? null,
        category: q.category,
        kind,
        osm: `${r.osm_type}/${r.osm_id}`,
        district: a.suburb ?? a.city_district ?? a.town ?? a.quarter ?? null,
        hours: t.opening_hours ?? null,
        cuisine: t.cuisine ?? null,
      }),
    );
  }
  report.push(`  ${String(accepted.length).padStart(2)}/${q.take} "${q.q}"`);
}

// DEMO posts: rotate through each group's templates so neighbouring places differ.
const cursor = new Map<string, number>();
const posts: Record<string, unknown>[] = [];
const sorted = [...places].sort((a, b) => String(a.properties!.id).localeCompare(String(b.properties!.id)));
sorted.forEach((p, i) => {
  const group = GROUP[p.properties!.kind as string];
  const pool = templates.filter((t) => t.group === group);
  if (!pool.length) return;
  const count = group === 'view' ? 1 : i % 3 === 0 ? 2 : 1;
  for (let k = 0; k < count; k++) {
    const c = cursor.get(group) ?? 0;
    cursor.set(group, c + 1);
    const { group: _g, id: tid, ...rest } = pool[c % pool.length];
    posts.push({ id: `${p.properties!.id}:${tid}`, placeId: p.properties!.id, template: tid, demo: true, ...rest });
  }
});

writeFileSync('data/places.geojson', JSON.stringify(turf.featureCollection(places), null, 1));
writeFileSync('data/posts.json', JSON.stringify({ _comment: 'DEMO content — generated from data/catalog/post-templates.json; not real announcements.', posts }, null, 1));
console.log(report.join('\n'));
const byCat = places.reduce<Record<string, number>>((m, p) => ((m[p.properties!.category as string] = (m[p.properties!.category as string] ?? 0) + 1), m), {});
console.log(`\n→ data/places.geojson: ${places.length} places ${JSON.stringify(byCat)}; with hours: ${places.filter((p) => p.properties!.hours).length}`);
console.log(`→ data/posts.json: ${posts.length} demo posts`);
