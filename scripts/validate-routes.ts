/**
 * Fails (exit 1) if any route leg touches land or passes within 30 m of the coast outside the
 * last 100 m into a pier (plan §4.6). Runs on committed data only — part of `npm run build`.
 *
 * Run: npm run validate:routes
 */
import { readFileSync } from 'node:fs';
import type { FeatureCollection, LineString, MultiPolygon, Polygon } from 'geojson';
import { shorelineFromLand } from '../src/map/shoreline';
import { DATA_BBOX } from './bbox';
import { localProj } from './lib/local-proj';
import { CoastIndex } from './lib/route-check';
import { ROUTE_RULES } from './lib/route-rules';

const land = JSON.parse(readFileSync('data/land.geojson', 'utf8')) as FeatureCollection<Polygon | MultiPolygon>;
const routes = JSON.parse(readFileSync('data/routes.geojson', 'utf8')) as FeatureCollection<
  LineString,
  { id: string; stops: string[]; stopVertex: number[] }
>;
const [w, s, , n] = DATA_BBOX;
const coast = new CoastIndex(shorelineFromLand(land, DATA_BBOX), land, localProj(w, s, (s + n) / 2));

let bad = 0;
for (const r of routes.features) {
  const { stops, stopVertex, id } = r.properties;
  if (stopVertex.length !== stops.length) throw new Error(`${id}: stopVertex/stops mismatch`);
  for (let k = 0; k < stops.length - 1; k++) {
    const leg = r.geometry.coordinates.slice(stopVertex[k], stopVertex[k + 1] + 1);
    const res = coast.checkLeg(leg, ROUTE_RULES.minCoastM, ROUTE_RULES.endExemptM);
    if (res.violations.length) {
      bad++;
      const v = res.violations[0];
      console.error(`✗ ${id} ${stops[k]} → ${stops[k + 1]}: ${v.kind} at ${v.along.toFixed(0)} m (${v.at.map((x) => x.toFixed(5))}), coast ${v.coastM.toFixed(0)} m`);
    }
  }
}
if (bad) {
  console.error(`${bad} route legs violate the water rules.`);
  process.exit(1);
}
console.log(`✓ ${routes.features.length} routes valid (no land, ≥ ${ROUTE_RULES.minCoastM} m from coast outside the last ${ROUTE_RULES.endExemptM} m)`);
