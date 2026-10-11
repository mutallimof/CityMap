/**
 * Route generator: for every line leg (berth → berth) find a water path that prefers open
 * water, then string-pull and smooth it into a natural curve. Writes:
 *   data/routes.geojson — one LineString per leg (pier → pier), for every pair of piers a line sails:
 *                         its simulated pattern + every consecutive pair of calls in data/timetables.json
 *   data/lines.json     — line specs + resolved berth ids
 * Each leg is validated with the same exact check as scripts/validate-routes.ts.
 * Optional `via` waypoints per leg ("from>to") in data/catalog/lines.json steer a route by hand.
 *
 * Run: npm run data:routes
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import { shorelineFromLand } from '../src/map/shoreline';
import { DATA_BBOX } from './bbox';
import { localProj } from './lib/local-proj';
import { chaikinSafe, findPath, rasterize, segmentOk, stringPull } from './lib/nav-grid';
import { CoastIndex } from './lib/route-check';
import { ROUTE_RULES } from './lib/route-rules';
import type { TimetableFile } from '../src/sim/timetable-data';

const CELL_M = 20;
const PATH = { minClear: 70, comfortClear: 350, hugPenalty: 4, endpointRadius: 180 };
/** Line-of-sight clearance for string pulling (mid-route / segments touching a berth). */
const LOS_CLEAR = 90;
const LOS_END_CLEAR = 10;
const SMOOTH_ITER = 5;
/**
 * Vessels glide in/out alongside the pier: the approach point lies APPROACH_ALONG_M along the shore
 * (towards the other end of the leg) and APPROACH_OUT_M out to sea. Shrinks if the water is tight;
 * falls back to straight out to sea.
 */
const APPROACH_ALONG_M = 240;
const APPROACH_OUT_M = 80;
/** Smoothing may cut corners down to this clearance (validator needs 30 m). */
const SMOOTH_CLEAR = 55;

interface CatalogLine {
  id: string;
  name: { tr: string; en: string };
  color: string;
  stops: string[];
  pattern: string[];
  berths: Record<string, string>;
  via?: Record<string, [number, number][]>;
  toCheck?: string[];
  service: Record<string, unknown>;
}
interface BerthProps {
  id: string;
  lngLat: [number, number];
  seawardBearing: number;
  alongBearing: number;
}
interface PierProps {
  id: string;
  berths: BerthProps[];
}

const land = JSON.parse(readFileSync('data/land.geojson', 'utf8')) as FeatureCollection<Polygon | MultiPolygon>;
const piers = JSON.parse(readFileSync('data/piers.geojson', 'utf8')) as FeatureCollection<Point, PierProps>;
const catalog = JSON.parse(readFileSync('data/catalog/lines.json', 'utf8')).lines as CatalogLine[];
const timetables = existsSync('data/timetables.json') ? (JSON.parse(readFileSync('data/timetables.json', 'utf8')) as TimetableFile) : null;

const [w, s, e, n] = DATA_BBOX;
const proj = localProj(w, s, (s + n) / 2);
const [width, height] = proj.toXY([e, n]);
const rings = land.features.flatMap((f) =>
  (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).flatMap((poly) => poly.map((r) => r.map((c) => proj.toXY(c)))),
);
console.log(`Rasterising land at ${CELL_M} m …`);
const grid = rasterize(rings, width, height, CELL_M);
console.log(`  grid ${grid.nx}×${grid.ny}`);
const coast = new CoastIndex(shorelineFromLand(land, DATA_BBOX), land, proj);

const pierById = new Map(piers.features.map((f) => [f.properties.id, f.properties]));
function berthOf(line: CatalogLine, pierId: string) {
  const pier = pierById.get(pierId);
  if (!pier) throw new Error(`${line.id}: unknown pier ${pierId}`);
  const wanted = line.berths[pierId];
  const b = wanted ? pier.berths.find((x) => x.id === wanted) : pier.berths[0];
  if (!b) throw new Error(`${line.id}: pier ${pierId} has no berth ${wanted}`);
  return b;
}

const unit = (bearing: number): [number, number] => [Math.sin((bearing * Math.PI) / 180), Math.cos((bearing * Math.PI) / 180)];

function openWater(p: [number, number], need: number): boolean {
  const [i, j] = [Math.floor(p[0] / CELL_M), Math.floor(p[1] / CELL_M)];
  if (i < 0 || j < 0 || i >= grid.nx || j >= grid.ny) return false;
  return !grid.land[j * grid.nx + i] && grid.clear[j * grid.nx + i] >= need;
}

/** How far along the raw water path to look for the side a berth is approached from (m). */
const APPROACH_PROBE_M = 600;

/** The point `d` metres along a path (or `fallback` if it's shorter). */
function pointAlong(path: [number, number][], d: number, fallback: [number, number]): [number, number] {
  let left = d;
  for (let i = 1; i < path.length; i++) {
    const seg = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    if (seg >= left) return path[i];
    left -= seg;
  }
  return fallback;
}

/** Approach point for a berth, on the along-shore side facing `toward` (where the leg's water path heads). */
function approachOf(b: BerthProps, toward: [number, number]): [number, number] {
  const [bx, by] = proj.toXY(b.lngLat);
  const sea = unit(b.seawardBearing);
  let along = unit(b.alongBearing);
  if ((toward[0] - bx) * along[0] + (toward[1] - by) * along[1] < 0) along = [-along[0], -along[1]];
  for (let k = 1; k >= 0.4; k -= 0.15) {
    const p: [number, number] = [bx + (along[0] * APPROACH_ALONG_M + sea[0] * APPROACH_OUT_M) * k, by + (along[1] * APPROACH_ALONG_M + sea[1] * APPROACH_OUT_M) * k];
    if (openWater(p, APPROACH_OUT_M * k * 0.6) && segmentOk(grid, [bx, by], p, { clear: 45, endClear: 10, endRadius: ROUTE_RULES.endExemptM - 10, ends: [[bx, by], [bx, by]] })) return p;
  }
  for (let d = 160; d >= 40; d -= 20) {
    const p: [number, number] = [bx + sea[0] * d, by + sea[1] * d];
    if (openWater(p, Math.min(PATH.minClear, d * 0.5))) return p;
  }
  return [bx, by];
}

/** Every pier pair a line sails: its pattern (main) + every consecutive pair of calls in its real timetable. */
function legPairs(line: CatalogLine): { from: string; to: string; main: boolean }[] {
  const out: { from: string; to: string; main: boolean }[] = [];
  const seen = new Set<string>();
  const add = (from: string, to: string, main: boolean) => {
    if (seen.has(`${from}>${to}`) || seen.has(`${to}>${from}`)) return;
    seen.add(`${from}>${to}`);
    out.push({ from, to, main });
  };
  for (let k = 0; k < line.pattern.length - 1; k++) add(line.pattern[k], line.pattern[k + 1], true);
  for (const t of timetables?.lines[line.id]?.trips ?? []) for (let k = 0; k < t.calls.length - 1; k++) add(t.calls[k].stop, t.calls[k + 1].stop, false);
  return out;
}

let failed = 0;
const routes: Feature[] = [];
const linesOut = [];
for (const line of catalog) {
  for (const s of line.pattern) if (!line.stops.includes(s)) throw new Error(`${line.id}: pattern stop ${s} not in stops`);
  for (const { from: fromId, to: toId, main } of legPairs(line)) {
    if (!line.stops.includes(fromId) || !line.stops.includes(toId)) throw new Error(`${line.id}: timetable calls at ${fromId}/${toId}, not in stops`);
    const [b0, b1] = [berthOf(line, fromId), berthOf(line, toId)];
    const from = proj.toXY(b0.lngLat);
    const to = proj.toXY(b1.lngLat);
    // Approach each berth from the side the water path actually comes from (in a bay the other pier's
    // straight-line direction can point the wrong way along the shore and force a hairpin).
    const probe = findPath(grid, from, to, PATH);
    const a0 = approachOf(b0, probe ? pointAlong(probe, APPROACH_PROBE_M, to) : to);
    const a1 = approachOf(b1, probe ? pointAlong([...probe].reverse(), APPROACH_PROBE_M, from) : from);
    // Relaxed clearance only near the berths (not at hand-placed via points).
    const rule = { clear: LOS_CLEAR, endClear: LOS_END_CLEAR, endRadius: ROUTE_RULES.endExemptM - 10, ends: [from, to] as [[number, number], [number, number]] };
    const pts = [a0, ...(line.via?.[`${fromId}>${toId}`] ?? []).map((c) => proj.toXY(c)), a1];
    let pulled: [number, number][] = [from];
    for (let v = 0; v < pts.length - 1; v++) {
      const raw = findPath(grid, pts[v], pts[v + 1], PATH);
      if (!raw) throw new Error(`${line.id} ${fromId} → ${toId}: no water path`);
      pulled = [...pulled, ...stringPull(grid, raw, rule)];
    }
    pulled.push(to);
    const leg = chaikinSafe(grid, pulled, SMOOTH_ITER, { ...rule, clear: SMOOTH_CLEAR });
    const ll = leg.map((p) => proj.toLngLat(p).map((v) => Number(v.toFixed(6))) as [number, number]);
    const check = coast.checkLeg(ll, ROUTE_RULES.minCoastM, ROUTE_RULES.endExemptM);
    const tag = `${fromId} → ${toId}${main ? '' : ' (timetable)'}`;
    if (check.violations.length) {
      failed++;
      const v = check.violations[0];
      console.log(`  ✗ ${line.id.padEnd(24)} ${tag.padEnd(36)} ${check.violations.length} bad samples, first: ${v.kind} at ${v.along.toFixed(0)} m (${v.at.map((x) => x.toFixed(5))})`);
    } else {
      console.log(`  ✓ ${line.id.padEnd(24)} ${tag.padEnd(36)} ${(check.length / 1000).toFixed(2)} km, ${ll.length} pts, min coast ${check.minCoastM.toFixed(0)} m`);
    }
    routes.push({
      type: 'Feature',
      properties: { id: `${line.id}:${fromId}>${toId}`, lineId: line.id, color: line.color, from: fromId, to: toId, main },
      geometry: { type: 'LineString', coordinates: ll },
    });
  }
  linesOut.push({
    id: line.id,
    name: line.name,
    color: line.color,
    stops: line.stops,
    pattern: line.pattern,
    berths: line.stops.map((p) => berthOf(line, p).id),
    service: line.service,
    ...(line.toCheck ? { toCheck: line.toCheck } : {}),
  });
}

writeFileSync('data/routes.geojson', JSON.stringify({ type: 'FeatureCollection', features: routes }));
writeFileSync('data/lines.json', JSON.stringify({ lines: linesOut }, null, 2) + '\n');
console.log(`\nWrote data/routes.geojson (${routes.length} legs) and data/lines.json`);
if (failed) {
  console.error(`✗ ${failed} legs fail validation — add "via" waypoints in data/catalog/lines.json or tune PATH.`);
  process.exit(1);
}
