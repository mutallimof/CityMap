/**
 * Piers + district labels from OSM → data/piers.geojson, data/districts.geojson.
 * Names/ids come from data/catalog/*.json; coordinates ONLY from OSM (data/raw).
 *
 * Run: npm run data:piers   (after npm run data:fetch-osm)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as turf from '@turf/turf';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { shorelineFromLand } from '../src/map/shoreline';
import { DATA_BBOX } from './bbox';
import { computeBerth } from './lib/berth';
import { localProj } from './lib/local-proj';
import { matchDistrict, matchPier, type CatalogEntry, type Match, type MatchResult } from './lib/match-places';
import { RAW_NOMINATIM, RAW_OVERPASS, elementPoint, osmRef, type OverpassElement, type OverpassResponse } from './lib/overpass';

/**
 * Sources: Nominatim (preferred; per-entry candidate pools so a berth at Kadıköy named
 * "Kabataş İskelesi" can't be mistaken for Kabataş) or an Overpass bbox dump.
 */
type Pool = (id: string) => OverpassElement[];
let pool: Pool;
/** Every element by "type/id", for pins and berths that turned up in another entry's lookup. */
let allByRef = new Map<string, OverpassElement>();
if (existsSync(RAW_NOMINATIM)) {
  const nom = JSON.parse(readFileSync(RAW_NOMINATIM, 'utf8')) as OverpassResponse & { log: { forId: string; refs: string[] }[] };
  const byRef = new Map(nom.elements.map((el) => [osmRef(el), el]));
  allByRef = byRef;
  pool = (id) => [...new Set(nom.log.filter((l) => l.forId === id).flatMap((l) => l.refs))].map((r) => byRef.get(r)!).filter(Boolean);
  console.log(`Source: ${RAW_NOMINATIM}`);
} else if (existsSync(RAW_OVERPASS)) {
  const raw = JSON.parse(readFileSync(RAW_OVERPASS, 'utf8')) as OverpassResponse;
  pool = () => raw.elements;
  allByRef = new Map(raw.elements.map((el) => [osmRef(el), el]));
  console.log(`Source: ${RAW_OVERPASS}`);
} else {
  console.error(`✗ No OSM source — run npm run data:fetch-nominatim (or data:fetch-osm) first.`);
  process.exit(1);
}
interface BerthEntry {
  id: string;
  osm: string;
  name: string;
}
const pierCatalog = JSON.parse(readFileSync('data/catalog/piers.json', 'utf8')).piers as (CatalogEntry & { berths?: BerthEntry[] })[];
const land = JSON.parse(readFileSync('data/land.geojson', 'utf8')) as FeatureCollection<Polygon | MultiPolygon>;
const shore = shorelineFromLand(land, DATA_BBOX);
const proj = localProj(DATA_BBOX[0], DATA_BBOX[1], (DATA_BBOX[1] + DATA_BBOX[3]) / 2);
/** How far off the coastline a vessel lies when docked (m). */
const BERTH_OFFSET_M = 30;

/** Pool for an entry plus any explicitly pinned features (pins may come from another entry's lookup). */
function poolWithPins(e: CatalogEntry & { berths?: BerthEntry[] }): OverpassElement[] {
  const refs = [e.osm, ...(e.berths ?? []).map((b) => b.osm)].filter((r): r is string => !!r);
  const extra = refs.map((r) => allByRef.get(r)).filter((el): el is OverpassElement => !!el);
  return [...new Set([...pool(e.id), ...extra])];
}

function berthsFor(e: CatalogEntry & { berths?: BerthEntry[] }, marker: Match) {
  const list = e.berths?.length ? e.berths : [{ id: `${e.id}-main`, osm: osmRef(marker.el), name: marker.el.tags?.name ?? e.tr }];
  return list.map((b) => {
    const el = allByRef.get(b.osm) ?? (b.osm === osmRef(marker.el) ? marker.el : undefined);
    const pt = el && elementPoint(el);
    if (!pt) throw new Error(`${e.id}: berth ${b.id} → ${b.osm} not found in OSM source`);
    const berth = computeBerth(pt, shore, land, proj, BERTH_OFFSET_M);
    if (berth.osmToCoastM > 250) console.warn(`  ! ${b.id}: OSM feature is ${berth.osmToCoastM} m from the coast`);
    return { id: b.id, name: b.name, osm: b.osm, ...berth };
  });
}
const districtCatalog = JSON.parse(readFileSync('data/catalog/districts.json', 'utf8')).districts as CatalogEntry[];

let problems = 0;
const VERBOSE = process.argv.includes('--verbose');

function build<E extends CatalogEntry>(
  kind: string,
  catalog: E[],
  matcher: (e: E) => MatchResult,
  out: string,
  extraProps: (e: E, chosen: Match) => Record<string, unknown> = () => ({}),
) {
  const features = [];
  console.log(`\n${kind}:`);
  for (const entry of catalog) {
    const r = matcher(entry);
    if (!r.chosen) {
      problems++;
      console.log(`  ✗ ${entry.id.padEnd(16)} no OSM match${entry.osm ? ` for pinned ${entry.osm}` : ''}`);
      continue;
    }
    const c = r.chosen;
    const flag = r.ambiguous ? '?' : '✓';
    console.log(`  ${flag} ${entry.id.padEnd(16)} ${osmRef(c.el).padEnd(18)} "${c.el.tags?.name}" (${r.candidates.length} candidates)`);
    if (r.ambiguous) problems++;
    if (r.ambiguous || (VERBOSE && r.candidates.length > 1)) {
      for (const alt of r.candidates.slice(0, 8))
        console.log(
          `      · ${osmRef(alt.el).padEnd(18)} score ${String(alt.score).padStart(2)} ${String(Math.round(turf.distance(alt.point, c.point, { units: 'meters' }))).padStart(5)} m  "${alt.el.tags?.name}"`,
        );
    }
    features.push(
      turf.point(c.point.map((v) => Number(v.toFixed(6))), {
        id: entry.id,
        name: entry.tr,
        nameEn: entry.en,
        osm: osmRef(c.el),
        ...extraProps(entry, c),
      }),
    );
  }
  writeFileSync(out, JSON.stringify(turf.featureCollection(features), null, 1));
  console.log(`  → ${out}: ${features.length}/${catalog.length}`);
}

build(
  'Piers',
  pierCatalog,
  (e) => matchPier(e, poolWithPins(e), pierCatalog.flatMap((o) => (o.id === e.id ? [] : (o.match ?? [o.tr])))),
  'data/piers.geojson',
  (e, marker) => ({ berths: berthsFor(e, marker) }),
);
build('Districts', districtCatalog, (e) => matchDistrict(e, pool(e.id)), 'data/districts.geojson');

if (problems) {
  console.log(`\n${problems} entries need attention: pin them with "osm": "<type>/<id>" in data/catalog/*.json.`);
}
