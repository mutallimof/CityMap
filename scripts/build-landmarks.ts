/**
 * Landmarks (towers, bridges, the Emirgan tulip grove) from OpenFreeMap vector tiles (OpenStreetMap data).
 *   in:  data/catalog/landmarks.json (names only), data/piers.geojson (where to look)
 *   out: data/landmarks.geojson — label points (+ building / landcover feature ids) and bridge lines
 *
 * Tiles are cached in data/raw/tiles/. Feature ids in OpenMapTiles-from-Planetiler tiles are
 * osm_id × 10 + (1 node | 2 way | 3 relation), so they double as OSM references.
 *
 * Run: npm run data:landmarks
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { VectorTile, type VectorTileFeature } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

interface Entry {
  id: string;
  name: string;
  nameEn: string;
  kind: 'tower' | 'bridge' | 'tulips';
  layer: string;
  match: string;
  class?: string;
  near: string;
  radius?: number;
}

const Z = 14;
const CACHE = 'data/raw/tiles';
const catalog = JSON.parse(readFileSync('data/catalog/landmarks.json', 'utf8')) as { landmarks: Entry[] };
const piers = JSON.parse(readFileSync('data/piers.geojson', 'utf8')) as GeoJSON.FeatureCollection<GeoJSON.Point, { id: string }>;

export function osmRef(tileId: number): string {
  const type = ['?', 'node', 'way', 'relation'][tileId % 10] ?? '?';
  return `${type}/${Math.floor(tileId / 10)}`;
}

function tileOf(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
  return [x, y];
}

let tileUrl = '';
async function tile(z: number, x: number, y: number): Promise<VectorTile> {
  mkdirSync(CACHE, { recursive: true });
  const file = `${CACHE}/${z}-${x}-${y}.pbf`;
  if (!existsSync(file)) {
    if (!tileUrl) {
      const tj = (await (await fetch('https://tiles.openfreemap.org/planet')).json()) as { tiles: string[] };
      tileUrl = tj.tiles[0];
    }
    const r = await fetch(tileUrl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
    if (!r.ok) throw new Error(`tile ${z}/${x}/${y}: ${r.status}`);
    writeFileSync(file, new Uint8Array(await r.arrayBuffer()));
  }
  return new VectorTile(new PbfReader(new Uint8Array(readFileSync(file))));
}

function features(t: VectorTile, layer: string): VectorTileFeature[] {
  const l = t.layers[layer];
  if (!l) return [];
  return Array.from({ length: l.length }, (_, i) => l.feature(i));
}

const round = (c: number[]) => c.map((v) => Number(v.toFixed(6)));
const out: GeoJSON.Feature[] = [];

for (const e of catalog.landmarks) {
  const pier = piers.features.find((p) => p.properties.id === e.near);
  if (!pier) throw new Error(`${e.id}: unknown pier ${e.near}`);
  const [cx, cy] = tileOf(pier.geometry.coordinates[0], pier.geometry.coordinates[1], Z);
  const r = e.radius ?? 2;
  const points: { coords: number[]; id: number; x: number; y: number }[] = [];
  const lines: number[][][] = [];
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++) {
      const t = await tile(Z, cx + dx, cy + dy);
      for (const f of features(t, e.layer)) {
        if (f.properties.name !== e.match) continue;
        if (e.class && f.properties.class !== e.class) continue;
        const g = f.toGeoJSON(cx + dx, cy + dy, Z).geometry;
        if (g.type === 'Point') points.push({ coords: g.coordinates, id: Number(f.id), x: cx + dx, y: cy + dy });
        else if (g.type === 'LineString') lines.push(g.coordinates);
        else if (g.type === 'MultiLineString') lines.push(...g.coordinates);
      }
    }

  if (e.kind === 'bridge') {
    if (!lines.length) {
      console.warn(`  ✗ ${e.id}: no "${e.match}" lines`);
      continue;
    }
    // Label at the middle of the span: midpoint of the two farthest-apart vertices.
    const all = lines.flat();
    let best: [number[], number[]] = [all[0], all[0]];
    let bestD = -1;
    for (const a of all)
      for (const b of all) {
        const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
        if (d > bestD) (bestD = d), (best = [a, b]);
      }
    const mid = [(best[0][0] + best[1][0]) / 2, (best[0][1] + best[1][1]) / 2];
    out.push({ type: 'Feature', properties: { id: e.id, name: e.name, nameEn: e.nameEn, kind: e.kind }, geometry: { type: 'Point', coordinates: round(mid) } });
    out.push({ type: 'Feature', properties: { id: e.id, kind: 'bridge-line' }, geometry: { type: 'MultiLineString', coordinates: lines.map((l) => l.map(round)) } });
    console.log(`  ✓ ${e.id}: ${lines.length} pieces, label ${round(mid)}`);
    continue;
  }

  // The POI shares its id with the building (tower) or landcover polygon (park) it was derived from;
  // prefer the candidate that has one (OSM often has both a node and a way with the same name).
  let p = points[0];
  let building: VectorTileFeature | undefined;
  let landcover: VectorTileFeature | undefined;
  for (const c of points) {
    const t = await tile(Z, c.x, c.y);
    building = features(t, 'building').find((f) => Number(f.id) === c.id);
    landcover = features(t, 'landcover').find((f) => Number(f.id) === c.id);
    if (building || landcover) {
      p = c;
      break;
    }
  }
  if (!p) {
    console.warn(`  ✗ ${e.id}: no "${e.match}" point`);
    continue;
  }
  out.push({
    type: 'Feature',
    properties: {
      id: e.id,
      name: e.name,
      nameEn: e.nameEn,
      kind: e.kind,
      osm: osmRef(p.id),
      tileId: p.id,
      building: building ? p.id : null,
      height: building ? Number(building.properties.render_height ?? 0) : null,
      landcover: landcover ? p.id : null,
    },
    geometry: { type: 'Point', coordinates: round(p.coords) },
  });
  console.log(`  ✓ ${e.id}: ${osmRef(p.id)} ${round(p.coords)}${building ? ' +building' : ''}${landcover ? ' +landcover' : ''}`);
}

writeFileSync('data/landmarks.geojson', JSON.stringify({ type: 'FeatureCollection', features: out }));
console.log(`→ data/landmarks.geojson: ${out.length} features`);
