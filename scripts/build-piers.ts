/**
 * Piers + district labels from OSM → data/piers.geojson, data/districts.geojson.
 * Names/ids come from data/catalog/*.json; coordinates ONLY from OSM (data/raw).
 *
 * Run: npm run data:piers   (after npm run data:fetch-osm)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as turf from '@turf/turf';
import { matchDistrict, matchPier, type CatalogEntry, type MatchResult } from './lib/match-places';
import { RAW_NOMINATIM, RAW_OVERPASS, osmRef, type OverpassElement, type OverpassResponse } from './lib/overpass';

/**
 * Sources: Nominatim (preferred; per-entry candidate pools so a berth at Kadıköy named
 * "Kabataş İskelesi" can't be mistaken for Kabataş) or an Overpass bbox dump.
 */
type Pool = (id: string) => OverpassElement[];
let pool: Pool;
if (existsSync(RAW_NOMINATIM)) {
  const nom = JSON.parse(readFileSync(RAW_NOMINATIM, 'utf8')) as OverpassResponse & { log: { forId: string; refs: string[] }[] };
  const byRef = new Map(nom.elements.map((el) => [osmRef(el), el]));
  pool = (id) => [...new Set(nom.log.filter((l) => l.forId === id).flatMap((l) => l.refs))].map((r) => byRef.get(r)!).filter(Boolean);
  console.log(`Source: ${RAW_NOMINATIM}`);
} else if (existsSync(RAW_OVERPASS)) {
  const raw = JSON.parse(readFileSync(RAW_OVERPASS, 'utf8')) as OverpassResponse;
  pool = () => raw.elements;
  console.log(`Source: ${RAW_OVERPASS}`);
} else {
  console.error(`✗ No OSM source — run npm run data:fetch-nominatim (or data:fetch-osm) first.`);
  process.exit(1);
}
const pierCatalog = JSON.parse(readFileSync('data/catalog/piers.json', 'utf8')).piers as CatalogEntry[];
const districtCatalog = JSON.parse(readFileSync('data/catalog/districts.json', 'utf8')).districts as CatalogEntry[];

let problems = 0;
const VERBOSE = process.argv.includes('--verbose');

function build(kind: string, catalog: CatalogEntry[], matcher: (e: CatalogEntry) => MatchResult, out: string) {
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
      }),
    );
  }
  writeFileSync(out, JSON.stringify(turf.featureCollection(features), null, 1));
  console.log(`  → ${out}: ${features.length}/${catalog.length}`);
}

build('Piers', pierCatalog, (e) => matchPier(e, pool(e.id), pierCatalog.flatMap((o) => (o.id === e.id ? [] : (o.match ?? [o.tr])))), 'data/piers.geojson');
build('Districts', districtCatalog, (e) => matchDistrict(e, pool(e.id)), 'data/districts.geojson');

if (problems) {
  console.log(`\n${problems} entries need attention: pin them with "osm": "<type>/<id>" in data/catalog/*.json.`);
}
