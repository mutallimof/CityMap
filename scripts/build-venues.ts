/**
 * Event venues → featured places, located from OpenStreetMap (OpenFreeMap tiles, cached).
 *   in:  data/catalog/venue-places.json (names + match patterns), data/piers.geojson (where to look)
 *   out: data/venue-places.geojson (same properties as data/places.geojson)
 * Run: npm run data:venues
 */
import { CONFIG } from '../src/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

interface Entry {
  id: string;
  name: string;
  kind: string;
  match: string;
  near: string;
  radius?: number;
  /** Nominatim query when the venue isn't a POI in the tiles. */
  nominatim?: string;
}
const Z = 14;
const CACHE = 'data/raw/tiles';
const cat = JSON.parse(readFileSync('data/catalog/venue-places.json', 'utf8')) as { venues: Entry[] };
const piers = JSON.parse(readFileSync('data/piers.geojson', 'utf8')) as GeoJSON.FeatureCollection<GeoJSON.Point, { id: string }>;
const tileOf = (lon: number, lat: number): [number, number] => {
  const n = 2 ** Z;
  return [Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n)];
};
let url = '';
async function tile(x: number, y: number): Promise<VectorTile> {
  mkdirSync(CACHE, { recursive: true });
  const f = `${CACHE}/${Z}-${x}-${y}.pbf`;
  if (!existsSync(f)) {
    url ||= ((await (await fetch('https://tiles.openfreemap.org/planet')).json()) as { tiles: string[] }).tiles[0];
    const r = await fetch(url.replace('{z}', String(Z)).replace('{x}', String(x)).replace('{y}', String(y)));
    writeFileSync(f, new Uint8Array(await r.arrayBuffer()));
  }
  return new VectorTile(new PbfReader(new Uint8Array(readFileSync(f))));
}
const CAT: Record<string, string> = { gallery: 'culture', arts_centre: 'culture', concert_hall: 'culture', museum: 'culture', theatre: 'culture' };
const out: GeoJSON.Feature[] = [];
for (const v of cat.venues) {
  const pier = piers.features.find((p) => p.properties.id === v.near)!;
  const [cx, cy] = tileOf(pier.geometry.coordinates[0], pier.geometry.coordinates[1]);
  const re = new RegExp(v.match, 'i');
  const r = v.radius ?? 2;
  const hits: { name: string; id: number; coords: number[]; cls: string }[] = [];
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++) {
      const t = await tile(cx + dx, cy + dy);
      const l = t.layers.poi;
      if (!l) continue;
      for (let i = 0; i < l.length; i++) {
        const f = l.feature(i);
        const name = String(f.properties.name ?? '');
        if (!re.test(name) || /^(bus|railway|parking|atm|bank|school|toilets)\//.test(`${f.properties.class}/`)) continue;
        const g = f.toGeoJSON(cx + dx, cy + dy, Z).geometry as GeoJSON.Point;
        hits.push({ name, id: Number(f.id), coords: g.coordinates, cls: `${f.properties.class}/${f.properties.subclass}` });
      }
    }
  if (!hits.length && v.nominatim) {
    // Not a tile POI (e.g. conference centres): ask Nominatim (OSM data), bounded to our area, ≤ 1 req/s.
    await new Promise((r) => setTimeout(r, 1100));
    const [w, s, e, n] = CONFIG.bounds;
    const q = new URLSearchParams({ q: v.nominatim, format: 'jsonv2', limit: '5', bounded: '1', viewbox: `${w},${n},${e},${s}` });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { headers: { 'User-Agent': 'IstanbulLivingCity/0.1 (github.com/mutallimof/CityMap) build-venues' } });
    const list = res.ok ? ((await res.json()) as { osm_type: string; osm_id: number; category: string; type: string; name: string; lat: string; lon: string }[]) : [];
    const m = list.find((x) => ['amenity', 'tourism', 'leisure', 'building'].includes(x.category) && re.test(x.name));
    if (m) hits.push({ name: m.name, id: m.osm_id * 10 + ({ node: 1, way: 2, relation: 3 } as Record<string, number>)[m.osm_type], coords: [Number(m.lon), Number(m.lat)], cls: `${m.category}/${m.type} (nominatim)` });
  }
  const uniq = [...new Map(hits.map((h) => [h.id, h])).values()];
  if (!uniq.length) {
    console.warn(`  ✗ ${v.id}: no OSM POI matching /${v.match}/ near ${v.near}`);
    continue;
  }
  const best = uniq[0];
  const type = ['', 'node', 'way', 'relation'][best.id % 10];
  console.log(`  ✓ ${v.id}: "${best.name}" ${type}/${Math.floor(best.id / 10)} ${best.cls}${uniq.length > 1 ? `  (also: ${uniq.slice(1, 4).map((u) => u.name).join(' · ')})` : ''}`);
  out.push({
    type: 'Feature',
    properties: { id: v.id, name: v.name, nameEn: null, category: CAT[v.kind] ?? 'culture', kind: v.kind, osm: `${type}/${Math.floor(best.id / 10)}`, district: null, hours: null, cuisine: null, website: null, phone: null, major: false },
    geometry: { type: 'Point', coordinates: best.coords.map((c) => Number(c.toFixed(6))) },
  });
}
writeFileSync('data/venue-places.geojson', JSON.stringify({ type: 'FeatureCollection', features: out }, null, 1));
console.log(`→ data/venue-places.geojson: ${out.length} venues`);
