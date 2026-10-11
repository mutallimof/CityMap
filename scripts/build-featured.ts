/**
 * More featured places, picked automatically (runs in GitHub Actions monthly — Overpass isn't reachable
 * from the dev sandbox): OSM places with good details — opening hours, website, cuisine, phone, Wikidata —
 * spread over the whole map (a ~2 km grid, round-robin) so inland neighbourhoods get pins too, not only
 * the shore. Chains (brand=*) and fast food are skipped; so are names on the exclude list.
 *   in:  Overpass (OSM), data/places.geojson + data/venue-places.geojson (already featured → skipped)
 *   out: data/places-auto.geojson (loaded with the other featured places)
 *
 * Run: npm run data:featured
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { CONFIG } from '../src/config';

const OUT = 'data/places-auto.geojson';
const UA = 'IstanbulLivingCity/0.1 (https://mutallimof.github.io/CityMap/; github.com/mutallimof/CityMap) featured-places';
const OVERPASS = (process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter,https://overpass.private.coffee/api/interpreter').split(',');
const CELL_DEG = 0.02; // ~2 km
const PER_CELL = 4;
/** How many to pick per app category (≈ 330 in all). */
export const QUOTA: Record<Category, number> = { food: 170, culture: 70, shopping: 30, park: 40, view: 20 };

type Category = 'food' | 'culture' | 'shopping' | 'park' | 'view';
export interface OsmEl {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
}

/** App category + kind (icon) for an OSM element, or null when it isn't a place for visitors. */
export function classify(t: Record<string, string>): { category: Category; kind: string } | null {
  const a = t.amenity;
  if (a === 'cafe' || a === 'restaurant' || a === 'bar' || a === 'pub' || a === 'ice_cream') return { category: 'food', kind: a === 'pub' ? 'bar' : a === 'ice_cream' ? 'confectionery' : a };
  if (t.shop === 'bakery' || t.shop === 'confectionery' || t.shop === 'pastry') return { category: 'food', kind: t.shop === 'bakery' ? 'bakery' : 'confectionery' };
  if (t.tourism === 'museum' || t.tourism === 'gallery') return { category: 'culture', kind: t.tourism };
  if (a === 'theatre' || a === 'cinema' || a === 'arts_centre') return { category: 'culture', kind: a };
  if (t.shop === 'mall' || t.shop === 'department_store' || a === 'marketplace') return { category: 'shopping', kind: t.shop ?? 'marketplace' };
  if (t.leisure === 'park' || t.leisure === 'garden') return { category: 'park', kind: t.leisure };
  if (t.tourism === 'viewpoint') return { category: 'view', kind: 'viewpoint' };
  return null;
}

/** Detail score: what a visitor can use (hours, website, cuisine, phone, Wikidata, English name). */
export function score(t: Record<string, string>): number {
  let s = 0;
  if (t.opening_hours) s += 3;
  if (t.website || t['contact:website']) s += 2;
  if (t.cuisine) s += 1.5;
  if (t.phone || t['contact:phone']) s += 1;
  if (t.wikidata) s += 1.5;
  if (t['name:en']) s += 0.5;
  return s;
}

/** Good enough to feature: hours or Wikidata, plus one more useful detail. Parks/views: Wikidata or a website. */
export function goodEnough(t: Record<string, string>, c: Category): boolean {
  if (!t.name || t.brand || t['brand:wikidata'] || t.amenity === 'fast_food') return false;
  if (c === 'park' || c === 'view') return !!(t.wikidata || t.website || t['name:en']);
  const more = !!(t.website || t['contact:website'] || t.cuisine || t.phone || t['contact:phone']);
  return !!(t.opening_hours || t.wikidata) && more;
}

/** Round-robin over grid cells: the best of each cell first, then the second best… until the quota. */
export function spread<T extends { cell: string; score: number }>(items: T[], quota: number, perCell = PER_CELL): T[] {
  const cells = new Map<string, T[]>();
  for (const it of items) (cells.get(it.cell) ?? cells.set(it.cell, []).get(it.cell)!).push(it);
  for (const l of cells.values()) l.sort((a, b) => b.score - a.score);
  const out: T[] = [];
  for (let round = 0; round < perCell && out.length < quota; round++) {
    const tier = [...cells.values()].map((l) => l[round]).filter(Boolean).sort((a, b) => b.score - a.score);
    for (const it of tier) {
      if (out.length >= quota) break;
      out.push(it);
    }
  }
  return out;
}

const slug = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One Overpass query for a small box, trying each endpoint with backoff (the servers 504 on big boxes). */
async function overpassBox(bb: string): Promise<OsmEl[]> {
  const q = `[out:json][timeout:120];
(
  nwr["amenity"~"^(cafe|restaurant|bar|pub|ice_cream|theatre|cinema|arts_centre|marketplace)$"]["name"](${bb});
  nwr["shop"~"^(bakery|confectionery|pastry|mall|department_store)$"]["name"](${bb});
  nwr["tourism"~"^(museum|gallery|viewpoint)$"]["name"](${bb});
  nwr["leisure"~"^(park|garden)$"]["name"](${bb});
);
out tags center;`;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of OVERPASS) {
      try {
        const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: q }), headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return ((await res.json()) as { elements: OsmEl[] }).elements;
      } catch (err) {
        console.warn(`  Overpass ${new URL(url).host} (${bb}) failed: ${(err as Error).message}`);
      }
    }
    await sleep(15_000 * (attempt + 1));
  }
  throw new Error(`Overpass failed for ${bb}`);
}

/** The map area as a 4×4 grid of small queries, one after another with a pause (polite). */
async function overpass(): Promise<OsmEl[]> {
  const [w, s, e, n] = CONFIG.bounds;
  const N = 4;
  const out: OsmEl[] = [];
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const bb = [s + ((n - s) * j) / N, w + ((e - w) * i) / N, s + ((n - s) * (j + 1)) / N, w + ((e - w) * (i + 1)) / N].map((x) => x.toFixed(4)).join(',');
      const els = await overpassBox(bb);
      console.log(`Overpass box ${i * N + j + 1}/${N * N}: ${els.length} elements`);
      out.push(...els);
      await sleep(3000);
    }
  const seen = new Set<string>();
  return out.filter((el) => !seen.has(`${el.type}/${el.id}`) && (seen.add(`${el.type}/${el.id}`), true));
}

async function main() {
  const featured = (file: string) => (existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { features: { properties: { osm: string; name: string } }[] }).features : []);
  const have = [...featured('data/places.geojson'), ...featured('data/venue-places.geojson')];
  const haveOsm = new Set(have.map((f) => f.properties.osm));
  const exclude = (JSON.parse(readFileSync('data/catalog/place-queries.json', 'utf8')) as { exclude?: string[] }).exclude ?? [];
  const excluded = (name: string) => exclude.some((x) => name.toLocaleLowerCase('tr').includes(x.toLocaleLowerCase('tr')));
  const [w, s, e, n] = CONFIG.bounds;

  const els = await overpass();
  const byCat = new Map<Category, { el: OsmEl; c: { category: Category; kind: string }; cell: string; score: number; lon: number; lat: number }[]>();
  const seenNames = new Set<string>();
  for (const el of els) {
    const t = el.tags ?? {};
    const c = classify(t);
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!c || lat === undefined || lon === undefined || !(lon > w && lon < e && lat > s && lat < n)) continue;
    if (haveOsm.has(`${el.type}/${el.id}`) || !goodEnough(t, c.category) || excluded(t.name)) continue;
    const key = `${t.name.toLocaleLowerCase('tr')}|${Math.round(lat * 200)}|${Math.round(lon * 200)}`; // same name ~500 m apart = one
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    const cell = `${Math.floor(lon / CELL_DEG)}:${Math.floor(lat / CELL_DEG)}`;
    (byCat.get(c.category) ?? byCat.set(c.category, []).get(c.category)!).push({ el, c, cell, score: score(t), lon, lat });
  }

  const features: GeoJSON.Feature[] = [];
  const used = new Set<string>();
  for (const [cat, quota] of Object.entries(QUOTA) as [Category, number][]) {
    const picked = spread(byCat.get(cat) ?? [], quota);
    console.log(`${cat}: ${picked.length} of ${(byCat.get(cat) ?? []).length} candidates`);
    for (const p of picked) {
      const t = p.el.tags;
      let id = `${slug(t.name) || 'place'}-${p.el.type[0]}${p.el.id}`;
      while (used.has(id)) id += 'x';
      used.add(id);
      features.push({
        type: 'Feature',
        properties: {
          id,
          name: t.name,
          nameEn: t['name:en'] ?? null,
          category: cat,
          kind: p.c.kind,
          osm: `${p.el.type}/${p.el.id}`,
          district: t['addr:suburb'] ?? t['addr:district'] ?? null,
          hours: t.opening_hours ?? null,
          cuisine: t.cuisine ?? null,
          website: t.website ?? t['contact:website'] ?? null,
          phone: t.phone ?? t['contact:phone'] ?? null,
          major: false,
          auto: true,
        },
        geometry: { type: 'Point', coordinates: [Number(p.lon.toFixed(6)), Number(p.lat.toFixed(6))] },
      });
    }
  }
  writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', features }, null, 0) + '\n');
  console.log(`→ ${OUT}: ${features.length} places in ${new Set(features.map((f) => `${Math.floor((f.geometry as GeoJSON.Point).coordinates[0] / CELL_DEG)}:${Math.floor((f.geometry as GeoJSON.Point).coordinates[1] / CELL_DEG)}`)).size} grid cells`);
}

if (process.argv[1]?.endsWith('build-featured.ts')) void main();
