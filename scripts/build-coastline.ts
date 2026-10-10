/**
 * Coastline pipeline → data/land.geojson (clipped to the plan bbox, simplified, < 400 KB).
 *
 * Sources (both OpenStreetMap, ODbL):
 *   overpass  — natural=coastline ways from data/raw/overpass-istanbul.json (npm run data:fetch-osm).
 *               Full OSM detail; this is the real one.
 *   geo-maps  — @geo-maps/earth-lands-10m npm package. Very coarse around Istanbul (~380 vertices
 *               for the whole bbox); placeholder only.
 * Default: overpass if the raw file exists, else geo-maps. Force with --source=overpass|geo-maps.
 *
 * Run: npm run data:coastline
 */
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import { DATA_BBOX } from './bbox';
import { assembleCoastline, type Poly } from './lib/assemble-coastline';
import { RAW_OVERPASS, type OverpassResponse } from './lib/overpass';

/** Douglas–Peucker tolerance in degrees (0.00006° ≈ 5–7 m here). */
const SIMPLIFY_TOLERANCE = 0.00006;
/** Drop islets smaller than this (m²) — invisible at any zoom we use. */
const MIN_AREA_M2 = 1500;
/** 5 decimals ≈ 1 m. */
const PRECISION = 5;
const MAX_BYTES = 400 * 1024;
const OUT = 'data/land.geojson';

type Source = 'overpass' | 'geo-maps';

const arg = process.argv.find((a) => a.startsWith('--source='))?.split('=')[1] as Source | undefined;
const source: Source = arg ?? (existsSync(RAW_OVERPASS) ? 'overpass' : 'geo-maps');

const round = (n: number) => Number(n.toFixed(PRECISION));
const simplifyLine = (line: Position[]): Position[] =>
  line.length < 3 ? line : turf.simplify(turf.lineString(line), { tolerance: SIMPLIFY_TOLERANCE, highQuality: true }).geometry.coordinates;

function fromOverpass(): Poly[] {
  const raw = JSON.parse(readFileSync(RAW_OVERPASS, 'utf8')) as OverpassResponse;
  const ways = raw.elements
    .filter((el) => el.type === 'way' && el.tags?.natural === 'coastline' && el.geometry?.length)
    .map((el) => el.geometry!.map((p) => [p.lon, p.lat]));
  console.log(`Overpass: ${ways.length} coastline ways`);
  const { polygons, warnings } = assembleCoastline(ways, DATA_BBOX, simplifyLine);
  for (const w of warnings) console.warn(`  ! ${w}`);
  return polygons;
}

function fromGeoMaps(): Poly[] {
  const require = createRequire(import.meta.url);
  const srcPath = require.resolve('@geo-maps/earth-lands-10m/map.geo.json');
  console.log(`geo-maps (coarse placeholder): reading ${srcPath} …`);
  const world = JSON.parse(readFileSync(srcPath, 'utf8')) as { geometries: (Polygon | MultiPolygon)[] };
  const [minX, minY, maxX, maxY] = DATA_BBOX;
  const hits = (ring: Position[]) => ring.some(([x, y]) => x >= minX && x <= maxX && y >= minY && y <= maxY);
  const out: Poly[] = [];
  for (const g of world.geometries) {
    for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
      // Large polygons may enclose the box without a vertex inside it; check bbox overlap via clip.
      if (!hits(poly[0]) && poly[0].length < 1000) continue;
      const clipped = turf.bboxClip(turf.polygon(poly), DATA_BBOX).geometry as Polygon | MultiPolygon;
      for (const p of clipped.type === 'Polygon' ? [clipped.coordinates] : clipped.coordinates) {
        const rings = p.filter((r) => r.length >= 4).map((r) => turf.simplify(turf.polygon([r]), { tolerance: SIMPLIFY_TOLERANCE }).geometry.coordinates[0]);
        if (rings.length) out.push(rings);
      }
    }
  }
  return out;
}

const polygons = source === 'overpass' ? fromOverpass() : fromGeoMaps();

const kept: Position[][][] = [];
for (const rings of polygons) {
  let f: Feature<Polygon> = turf.polygon(rings);
  if (turf.area(f) < MIN_AREA_M2) continue;
  // RFC 7946 winding: exterior CCW, holes CW → land is always on the LEFT of each
  // ring, which the style relies on for the inward shoreline shadow.
  f = turf.rewind(f, { reverse: false }) as Feature<Polygon>;
  const out = f.geometry.coordinates.map((ring) => ring.map(([x, y]) => [round(x), round(y)])).filter((ring) => ring.length >= 4);
  if (out.length) kept.push(out);
}

const fc = turf.featureCollection([
  turf.multiPolygon(kept, {
    source: source === 'overpass' ? 'OpenStreetMap natural=coastline via Overpass' : '@geo-maps/earth-lands-10m (OpenStreetMap)',
    license: 'ODbL — © OpenStreetMap contributors',
    bbox: DATA_BBOX.join(','),
  }),
]);
writeFileSync(OUT, JSON.stringify(fc));
const bytes = statSync(OUT).size;
const vertices = kept.reduce((n, p) => n + p.reduce((m, r) => m + r.length, 0), 0);
const km2 = kept.reduce((a, p) => a + turf.area(turf.polygon(p)), 0) / 1e6;
console.log(`Wrote ${OUT} [${source}]: ${kept.length} polygons, ${vertices} vertices, ${km2.toFixed(0)} km² land, ${(bytes / 1024).toFixed(0)} KB`);
if (bytes > MAX_BYTES) {
  console.error(`✗ ${OUT} exceeds the ${MAX_BYTES / 1024} KB budget — raise SIMPLIFY_TOLERANCE`);
  process.exit(1);
}
