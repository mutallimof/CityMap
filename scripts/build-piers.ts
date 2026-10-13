/**
 * Piers + district labels from OSM → data/piers.geojson, data/districts.geojson.
 * Names/ids come from data/catalog/*.json; coordinates ONLY from OSM (data/raw).
 *
 * Run: npm run data:piers   (after npm run data:fetch-osm)
 *      npm run data:piers -- --only=<ids>   (after npm run data:fetch-lookup): rebuilds only those piers from
 *      their pinned OSM features and merges them into the committed data/piers.geojson — every other pier
 *      stays byte-for-byte as it is (districts are not rebuilt).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as turf from '@turf/turf';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { shorelineFromLand } from '../src/map/shoreline';
import { CONFIG } from '../src/config';
import { DATA_BBOX } from './bbox';
import { computeBerth } from './lib/berth';
import { localProj } from './lib/local-proj';
import { matchDistrict, matchPier, type CatalogEntry, type Match, type MatchResult } from './lib/match-places';
import { RAW_LOOKUP, RAW_NOMINATIM, RAW_OVERPASS, elementPoint, osmRef, type OverpassElement, type OverpassResponse } from './lib/overpass';

/**
 * Sources: Nominatim (preferred; per-entry candidate pools so a berth at Kadıköy named
 * "Kabataş İskelesi" can't be mistaken for Kabataş) or an Overpass bbox dump.
 */
type Pool = (id: string) => OverpassElement[];
let pool: Pool;
/** Every element by "type/id", for pins and berths that turned up in another entry's lookup. */
let allByRef = new Map<string, OverpassElement>();
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
if (ONLY) {
  if (!existsSync(RAW_LOOKUP)) {
    console.error(`✗ --only needs ${RAW_LOOKUP} — run npm run data:fetch-lookup first.`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(RAW_LOOKUP, 'utf8')) as OverpassResponse;
  allByRef = new Map(raw.elements.map((el) => [osmRef(el), el]));
  pool = () => raw.elements;
  console.log(`Source: ${RAW_LOOKUP} (only ${ONLY.join(', ')})`);
} else if (existsSync(RAW_NOMINATIM)) {
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
// Pinned features looked up by id (operator piers) count in a full rebuild too.
if (!ONLY && existsSync(RAW_LOOKUP)) for (const el of (JSON.parse(readFileSync(RAW_LOOKUP, 'utf8')) as OverpassResponse).elements) if (!allByRef.has(osmRef(el))) allByRef.set(osmRef(el), el);
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

/**
 * Şehir Hatları berths already built (data/piers.geojson, piers without "operator"): a private operator's
 * berth must not land on one of them (see besideQuay).
 */
const publicBerthGeom: { lngLat: [number, number]; seawardBearing: number; alongBearing: number }[] = existsSync('data/piers.geojson')
  ? (JSON.parse(readFileSync('data/piers.geojson', 'utf8')) as { features: { properties: { operator?: string; berths: { lngLat: [number, number]; seawardBearing: number; alongBearing: number }[] } }[] }).features
      .filter((f) => !f.properties.operator)
      .flatMap((f) => f.properties.berths)
  : [];
const publicBerths = publicBerthGeom.map((b) => b.lngLat);
/** Berths closer than this are drawn apart for long hulls (src/sim/network.ts SIBLING_M). */
const SIBLING_M = 350;
/** A private operator's boats lie this far (m, along our coastline) from a Şehir Hatları berth at least: a hull length + room. */
const BESIDE_M = 80;
const SAME_SPOT_M = 40;
const dist = (a: [number, number], b: [number, number]) => turf.distance(a, b, { units: 'meters' });

/**
 * Our simplified coastline can snap a private operator's own pontoon onto the Şehir Hatları berth next to it
 * (Karaköy 10 m, Üsküdar 2 m apart, though the OSM features are separate pontoons). Then the berth — the
 * point a vessel docks at, not the pier — slides along our coastline, towards the pier's own OSM point first,
 * to the nearest spot BESIDE_M from the Şehir Hatları berth that is still water at the berth offset.
 */
function besideQuay(osmPt: [number, number], berth: ReturnType<typeof computeBerth>): ReturnType<typeof computeBerth> {
  const near = publicBerths.find((b) => dist(b, berth.lngLat) < SAME_SPOT_M);
  if (!near) return berth;
  const [bx, by] = proj.toXY(berth.lngLat);
  const r = (berth.alongBearing * Math.PI) / 180;
  const [ox, oy] = proj.toXY(osmPt);
  const [nx, ny] = proj.toXY(near);
  const towardOsm = (ox - nx) * Math.sin(r) + (oy - ny) * Math.cos(r) >= 0 ? 1 : -1;
  for (const sign of [towardOsm, -towardOsm])
    for (let m = 10; m <= 400; m += 5) {
      const p = proj.toLngLat([bx + Math.sin(r) * m * sign, by + Math.cos(r) * m * sign]);
      const b = computeBerth(p, shore, land, proj, BERTH_OFFSET_M);
      const wet = !land.features.some((f) => turf.booleanPointInPolygon(b.lngLat, f));
      if (wet && dist(b.lngLat, near) >= BESIDE_M && publicBerths.every((q) => dist(b.lngLat, q) >= BESIDE_M * 0.75)) {
        console.log(`  · berth moved ${Math.round(dist(b.lngLat, berth.lngLat))} m along the coast, ${Math.round(dist(b.lngLat, near))} m from the Şehir Hatları berth it snapped onto`);
        return { ...b, osmToCoastM: berth.osmToCoastM };
      }
    }
  throw new Error('no free spot beside the Şehir Hatları berth');
}

/** Şehir Hatları boats an operator's boat keeps clear of at a nearby berth: slots 0 … ABREAST − 1 (Kadıköy: up to 4). */
const ABREAST = 4;
/** An operator's own boats moored abreast at its berth that must lie on water (Karaköy Turyol: up to 4, three lines call). */
const OWN_SLOTS = 4;
/** Hull exaggeration at city zoom (CONFIG.ferries.exaggeration, ~z14): the second shift is worked out for it. */
const CITY_EXAG = 3.9;

type XY = [number, number];
/** Corners of a docked hull (local metres) centred `c`, lying along `bearing`. */
function hullCorners(c: XY, bearing: number, L: number, B: number): XY[] {
  const r = (bearing * Math.PI) / 180;
  const f: XY = [Math.sin(r), Math.cos(r)];
  const sd: XY = [Math.cos(r), -Math.sin(r)];
  return [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([i, j]) => [c[0] + (f[0] * L * i + sd[0] * B * j) / 2, c[1] + (f[1] * L * i + sd[1] * B * j) / 2]);
}
/** Distance from a point to a convex quad given by hullCorners (0 inside). */
function pointToQuad(p: XY, q: XY[]): number {
  const ring = [q[0], q[1], q[3], q[2]]; // hullCorners order → around the rectangle
  let inside = true;
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % 4];
    const cross = (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax);
    if (cross < 0) inside = false;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    best = Math.min(best, Math.hypot(p[0] - (ax + t * (bx - ax)), p[1] - (ay + t * (by - ay))));
  }
  const allNeg = ring.every((_, i) => {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % 4];
    return (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax) <= 0;
  });
  return inside || allNeg ? 0 : best;
}
/** Separating-axis test of two convex quads. */
function quadsOverlap(a: XY[], b: XY[]): boolean {
  for (const poly of [a, b])
    for (let i = 0; i < 4; i++) {
      const [x0, y0] = poly[i];
      const [x1, y1] = poly[(i + 1) % 4];
      const ax: XY = [y1 - y0, x0 - x1];
      const pa = a.map(([x, y]) => x * ax[0] + y * ax[1]);
      const pb = b.map(([x, y]) => x * ax[0] + y * ax[1]);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  return true;
}

/**
 * How an operator's boats keep clear of nearby Şehir Hatları berths (src/sim/fleet.ts berthOffset), worked out
 * here because it needs the coastline. For real-size hulls: the smallest shift (5 m steps, directions every 10°,
 * "straight away from the nearest Şehir Hatları berth" first) at which the docked hull clears every Şehir
 * Hatları hull moored at those berths (slots 0 … ABREAST − 1), also while either one swings round on the spot,
 * and lies on water (centre and both ends). For city-zoom hulls (×CITY_EXAG): the same search, moored hulls
 * only (a swing takes ~50 s), centre on water; none found → the real-size shift. Stored as [unit east, unit
 * north (away from the nearest Şehir Hatları berth), its distance m, real shift east, north, city shift east,
 * north] — shifts in drawn hull lengths; fleet.ts interpolates by exaggeration. Şehir Hatları boats never move.
 */
type OperatorSpread = [number, number, number, number, number, number, number];
function operatorSpread(b: [number, number], along: number, seaward: number): OperatorSpread | undefined {
  const F = CONFIG.ferries;
  const near = publicBerthGeom.filter((q) => dist(q.lngLat, b) < SIBLING_M);
  if (!near.length) return undefined;
  const nearest = near.map((q) => ({ q, d: dist(q.lngLat, b) })).sort((x, y) => x.d - y.d)[0];
  const [bx, by] = proj.toXY(b);
  const wet = (x: number, y: number) => !land.features.some((f) => turf.booleanPointInPolygon(proj.toLngLat([x, y]), f));
  /** The smallest clear shift (m, east / north) for hulls drawn × exag, or null. */
  const search = (exag: number, swing: boolean, ends: boolean): XY | null => {
    const L = F.lengthM * exag;
    const B = F.beamM * exag;
    const quay = Math.max(0, (B / 2) * (1 + F.quayClearance) - F.berthOffsetM);
    const boats = near.flatMap((q) => {
      const [qx0, qy0] = proj.toXY(q.lngLat);
      // Its own sibling spread (src/sim/network.ts berthSpread → fleet.ts): half the shortfall from the nearest Şehir Hatları berth.
      const sib = publicBerthGeom.filter((o) => o !== q && dist(o.lngLat, q.lngLat) < SIBLING_M).sort((x, y) => dist(x.lngLat, q.lngLat) - dist(y.lngLat, q.lngLat))[0];
      let [qx, qy] = [qx0, qy0];
      if (sib) {
        const [sx, sy] = proj.toXY(sib.lngLat);
        const sd = Math.hypot(qx0 - sx, qy0 - sy);
        const k = Math.max(0, (L * 1.08 - sd) / 2);
        [qx, qy] = [qx0 + ((qx0 - sx) / sd) * k, qy0 + ((qy0 - sy) / sd) * k];
      }
      const r = (q.seawardBearing * Math.PI) / 180;
      return Array.from({ length: ABREAST }, (_, slot) => {
        const out = quay + slot * B * F.slotSpacing;
        const c: XY = [qx + Math.sin(r) * out, qy + Math.cos(r) * out];
        return { c, hull: hullCorners(c, q.alongBearing, L, B) };
      });
    });
    const sr = (seaward * Math.PI) / 180;
    const own: XY = [bx + Math.sin(sr) * quay, by + Math.cos(sr) * quay];
    const ar = (along * Math.PI) / 180;
    const [nx, ny] = proj.toXY(nearest.q.lngLat);
    const away = Math.atan2(bx - nx, by - ny);
    for (let m = 0; m <= 600; m += 5)
      for (let i = 0; i < 36; i++) {
        const a = away + (Math.ceil(i / 2) * (i % 2 ? 1 : -1) * Math.PI) / 18;
        const c: XY = [own[0] + Math.sin(a) * m, own[1] + Math.cos(a) * m];
        // This berth's own boats moor abreast too (slots 0 … OWN_SLOTS − 1, seaward): every one on water.
        const onWater = Array.from({ length: OWN_SLOTS }, (_, k) => k * B * F.slotSpacing).every((out) =>
          (ends ? [-F.lengthM / 2, 0, F.lengthM / 2] : [0]).every((t) => wet(c[0] + Math.sin(sr) * out + Math.sin(ar) * t, c[1] + Math.cos(sr) * out + Math.cos(ar) * t)),
        );
        if (!onWater) continue;
        const mine = hullCorners(c, along, L, B);
        // Moored hulls must not touch; with `swing`, a hull swinging round on the spot (a disc of half its length)
        // must not reach the other one moored either way round (Şehir Hatları boats turn without knowing about it).
        if (boats.every((o) => !quadsOverlap(mine, o.hull) && (!swing || (pointToQuad(o.c, mine) >= L / 2 && pointToQuad(c, o.hull) >= L / 2)))) return [Math.sin(a) * m, Math.cos(a) * m];
      }
    return null;
  };
  const real = search(1, true, true);
  if (!real) throw new Error('no clear water next to the Şehir Hatları berth');
  const city = search(CITY_EXAG, false, false) ?? [real[0] * CITY_EXAG, real[1] * CITY_EXAG];
  const [nx, ny] = proj.toXY(nearest.q.lngLat);
  const d = Math.hypot(bx - nx, by - ny);
  const r4 = (v: number) => Number(v.toFixed(4));
  return [r4((bx - nx) / d), r4((by - ny) / d), Math.round(nearest.d * 10) / 10, r4(real[0] / F.lengthM), r4(real[1] / F.lengthM), r4(city[0] / (F.lengthM * CITY_EXAG)), r4(city[1] / (F.lengthM * CITY_EXAG))];
}

function berthsFor(e: CatalogEntry & { berths?: BerthEntry[]; operator?: string }, marker: Match) {
  const list = e.berths?.length ? e.berths : [{ id: `${e.id}-main`, osm: osmRef(marker.el), name: marker.el.tags?.name ?? e.tr }];
  return list.map((b) => {
    const el = allByRef.get(b.osm) ?? (b.osm === osmRef(marker.el) ? marker.el : undefined);
    const pt = el && elementPoint(el);
    if (!pt) throw new Error(`${e.id}: berth ${b.id} → ${b.osm} not found in OSM source`);
    const snapped = computeBerth(pt, shore, land, proj, BERTH_OFFSET_M);
    const berth = e.operator ? besideQuay(pt, snapped) : snapped;
    const spread = e.operator ? operatorSpread(berth.lngLat, berth.alongBearing, berth.seawardBearing) : undefined;
    if (berth.osmToCoastM > 250) console.warn(`  ! ${b.id}: OSM feature is ${berth.osmToCoastM} m from the coast`);
    return { id: b.id, name: b.name, osm: b.osm, ...berth, ...(spread ? { spread } : {}) };
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
  if (ONLY) {
    // Merge: keep every committed feature as it is, replace / append only the rebuilt ones.
    const old = JSON.parse(readFileSync(out, 'utf8')) as { features: { properties: { id: string } }[] };
    const fresh = new Map(features.map((f) => [f.properties.id as string, f]));
    const merged = old.features.map((f) => fresh.get(f.properties.id) ?? f);
    for (const f of features) if (!old.features.some((o) => o.properties.id === f.properties.id)) merged.push(f);
    writeFileSync(out, JSON.stringify({ ...turf.featureCollection([]), features: merged }, null, 1));
    console.log(`  → ${out}: ${features.length} rebuilt, ${merged.length} in all`);
    return;
  }
  writeFileSync(out, JSON.stringify(turf.featureCollection(features), null, 1));
  console.log(`  → ${out}: ${features.length}/${catalog.length}`);
}

build(
  'Piers',
  ONLY ? pierCatalog.filter((e) => ONLY.includes(e.id)) : pierCatalog,
  (e) => matchPier(e, poolWithPins(e), pierCatalog.flatMap((o) => (o.id === e.id ? [] : (o.match ?? [o.tr])))),
  'data/piers.geojson',
  (e, marker) => ({ ...((e as { operator?: string }).operator ? { operator: (e as { operator?: string }).operator } : {}), berths: berthsFor(e, marker) }),
);
if (!ONLY) build('Districts', districtCatalog, (e) => matchDistrict(e, pool(e.id)), 'data/districts.geojson');

if (problems) {
  console.log(`\n${problems} entries need attention: pin them with "osm": "<type>/<id>" in data/catalog/*.json.`);
}
