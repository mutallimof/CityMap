/**
 * Piers + district labels from OSM → data/piers.geojson, data/districts.geojson.
 * Names/ids come from data/catalog/*.json; coordinates ONLY from OSM (data/raw).
 *
 * Run: npm run data:piers   (after npm run data:fetch-osm)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as turf from '@turf/turf';
import { matchDistrict, matchPier, type CatalogEntry, type MatchResult } from './lib/match-places';
import { RAW_OVERPASS, osmRef, type OverpassResponse } from './lib/overpass';

if (!existsSync(RAW_OVERPASS)) {
  console.error(`✗ ${RAW_OVERPASS} missing — run npm run data:fetch-osm first.`);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(RAW_OVERPASS, 'utf8')) as OverpassResponse;
const pierCatalog = JSON.parse(readFileSync('data/catalog/piers.json', 'utf8')).piers as CatalogEntry[];
const districtCatalog = JSON.parse(readFileSync('data/catalog/districts.json', 'utf8')).districts as CatalogEntry[];

let problems = 0;

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
    if (r.ambiguous) {
      problems++;
      for (const alt of r.candidates.slice(0, 6))
        console.log(`      · ${osmRef(alt.el).padEnd(18)} score ${alt.score} "${alt.el.tags?.name}" ${alt.point.map((v) => v.toFixed(5)).join(',')}`);
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

build('Piers', pierCatalog, (e) => matchPier(e, raw.elements), 'data/piers.geojson');
build('Districts', districtCatalog, (e) => matchDistrict(e, raw.elements), 'data/districts.geojson');

if (problems) {
  console.log(`\n${problems} entries need attention: pin them with "osm": "<type>/<id>" in data/catalog/*.json.`);
}
