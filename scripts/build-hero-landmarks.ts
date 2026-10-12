/**
 * Hero landmarks (toy models in themes with style.landmarks3d): position, footprint and height from
 * OpenStreetMap building polygons in OpenFreeMap vector tiles.
 *   in:  data/catalog/hero-landmarks.json (names / match rules), data/piers.geojson (where to look)
 *   out: data/hero-landmarks.json — per landmark: OSM ref, footprint centre, oriented size (length ≥ width,
 *        bearing of the long side), height (OSM render_height), and the matching featured place id if any.
 * Tiles are cached in data/raw/tiles/. Run: npm run data:hero-landmarks
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { VectorTile, type VectorTileFeature } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

interface Entry {
  id: string;
  name: string;
  nameEn: string;
  model: string;
  match: string;
  class?: string;
  near: string;
}

const Z = 14;
const CACHE = 'data/raw/tiles';
const catalog = JSON.parse(readFileSync('data/catalog/hero-landmarks.json', 'utf8')) as { landmarks: Entry[] };
const piers = JSON.parse(readFileSync('data/piers.geojson', 'utf8')) as GeoJSON.FeatureCollection<GeoJSON.Point, { id: string }>;
const featured = [
  ...(JSON.parse(readFileSync('data/places.geojson', 'utf8')) as GeoJSON.FeatureCollection<GeoJSON.Point, { id: string; osm: string }>).features,
  ...(JSON.parse(readFileSync('data/places-auto.geojson', 'utf8')) as GeoJSON.FeatureCollection<GeoJSON.Point, { id: string; osm: string }>).features,
];

const osmRef = (tileId: number) => `${['?', 'node', 'way', 'relation'][tileId % 10] ?? '?'}/${Math.floor(tileId / 10)}`;
function tileOf(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  return [Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n)];
}

let tileUrl = '';
async function tile(z: number, x: number, y: number): Promise<VectorTile> {
  mkdirSync(CACHE, { recursive: true });
  const file = `${CACHE}/${z}-${x}-${y}.pbf`;
  if (!existsSync(file)) {
    if (!tileUrl) tileUrl = ((await (await fetch('https://tiles.openfreemap.org/planet')).json()) as { tiles: string[] }).tiles[0];
    const r = await fetch(tileUrl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
    if (!r.ok) throw new Error(`tile ${z}/${x}/${y}: ${r.status}`);
    writeFileSync(file, new Uint8Array(await r.arrayBuffer()));
  }
  return new VectorTile(new PbfReader(new Uint8Array(readFileSync(file))));
}
const features = (t: VectorTile, layer: string): VectorTileFeature[] => {
  const l = t.layers[layer];
  return l ? Array.from({ length: l.length }, (_, i) => l.feature(i)) : [];
};

/** Minimum-area oriented rectangle of points in local metres: length ≥ width, bearing of the long side (0–180°). */
export function orientedBox(pts: [number, number][]): { cx: number; cy: number; length: number; width: number; bearing: number } {
  let best = { area: Infinity, cx: 0, cy: 0, length: 0, width: 0, bearing: 0 };
  for (let a = 0; a < 180; a += 0.5) {
    const r = (a * Math.PI) / 180;
    const [ux, uy] = [Math.sin(r), Math.cos(r)]; // along bearing a
    const [vx, vy] = [uy, -ux];
    let [u0, u1, v0, v1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, y] of pts) {
      const u = x * ux + y * uy;
      const v = x * vx + y * vy;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (area < best.area - 1e-6) {
      const uc = (u0 + u1) / 2;
      const vc = (v0 + v1) / 2;
      const [len, wid, bear] = u1 - u0 >= v1 - v0 ? [u1 - u0, v1 - v0, a] : [v1 - v0, u1 - u0, (a + 90) % 180];
      best = { area, cx: uc * ux + vc * vx, cy: uc * uy + vc * vy, length: len, width: wid, bearing: bear };
    }
  }
  return { cx: best.cx, cy: best.cy, length: best.length, width: best.width, bearing: best.bearing };
}

const out: unknown[] = [];
for (const e of catalog.landmarks) {
  const pier = piers.features.find((p) => p.properties.id === e.near);
  if (!pier) throw new Error(`${e.id}: unknown pier ${e.near}`);
  const [cx, cy] = tileOf(pier.geometry.coordinates[0], pier.geometry.coordinates[1], Z);
  const pois: { id: number; ll: [number, number] }[] = [];
  for (let dx = -2; dx <= 2; dx++)
    for (let dy = -2; dy <= 2; dy++)
      for (const f of features(await tile(Z, cx + dx, cy + dy), 'poi'))
        if (f.properties.name === e.match && (!e.class || f.properties.class === e.class)) pois.push({ id: Number(f.id), ll: (f.toGeoJSON(cx + dx, cy + dy, Z).geometry as GeoJSON.Point).coordinates as [number, number] });
  // OFM's z14 building layer merges same-height buildings (ids don't match): take the building polygon
  // under the POI point, else the nearest sizeable one (a mosque's POI can sit in its courtyard).
  let ring: [number, number][] = [];
  let height = 0;
  let found = 0;
  let bestScore = Infinity;
  for (const poi of pois) {
    const [tx, ty] = tileOf(poi.ll[0], poi.ll[1], Z);
    const kx0 = 111_320 * Math.cos((poi.ll[1] * Math.PI) / 180);
    for (const f of features(await tile(Z, tx, ty), 'building')) {
      const g = f.toGeoJSON(tx, ty, Z).geometry;
      const polys = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) as [number, number][][][];
      for (const poly of polys) {
        const outer = poly[0];
        const loc = outer.map(([x, y]) => [(x - poi.ll[0]) * kx0, (y - poi.ll[1]) * 110_574] as [number, number]);
        const area = Math.abs(loc.reduce((a, [x, y], i) => a + x * loc[(i + 1) % loc.length][1] - loc[(i + 1) % loc.length][0] * y, 0) / 2);
        let inside = false;
        for (let i = 0, j = loc.length - 1; i < loc.length; j = i++) {
          const [xi, yi] = loc[i];
          const [xj, yj] = loc[j];
          if (yi > 0 !== yj > 0 && 0 < ((xj - xi) * (0 - yi)) / (yj - yi) + xi) inside = !inside;
        }
        const c = loc.reduce((a, p) => [a[0] + p[0] / loc.length, a[1] + p[1] / loc.length], [0, 0]);
        const score = inside ? -area : area > 400 ? Math.hypot(c[0], c[1]) : Infinity;
        if (score < bestScore && (inside || Math.hypot(c[0], c[1]) < 90)) {
          bestScore = score;
          ring = outer;
          height = Number(f.properties.render_height ?? 0);
          found = poi.id;
        }
      }
    }
  }
  if (!found) {
    console.warn(`  ✗ ${e.id}: no building for "${e.match}" (${pois.map((p) => osmRef(p.id)).join(', ') || 'no POI'})`);
    continue;
  }
  // Local metres around the first vertex → oriented box → back to lng/lat.
  const [lon0, lat0] = ring[0];
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_574;
  ring = ring.map(([x, y]) => [(x - lon0) * kx, (y - lat0) * ky]);
  const box = orientedBox(ring);
  const lngLat = [Number((lon0 + box.cx / kx).toFixed(6)), Number((lat0 + box.cy / ky).toFixed(6))];
  const osm = osmRef(found);
  const place = featured.find((p) => p.properties.osm === osm)?.properties.id ?? null;
  out.push({ id: e.id, name: e.name, nameEn: e.nameEn, model: e.model, osm, tileId: found, lngLat, lengthM: Math.round(box.length), widthM: Math.round(box.width), bearing: Math.round(box.bearing), heightM: Math.round(height), place });
  console.log(`  ✓ ${e.id}: ${osm} ${lngLat} ${Math.round(box.length)}×${Math.round(box.width)} m @${Math.round(box.bearing)}° h${Math.round(height)}${place ? ` place ${place}` : ''}`);
}
writeFileSync('data/hero-landmarks.json', JSON.stringify({ landmarks: out }, null, 1) + '\n');
console.log(`→ data/hero-landmarks.json: ${out.length} landmarks`);
