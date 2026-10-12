import type { FeatureCollection, LineString } from 'geojson';
import { legPath, type LinePath, type LngLat, type StopBerth } from './path';
import type { LineInput } from './schedule';
import type { LegSpec, LineSpec } from './types';

/** One route leg in data/routes.geojson: geometry from pier `from` to pier `to` (sailed either way). */
export interface RouteProps {
  id: string;
  lineId: string;
  color: string;
  from: string;
  to: string;
  /** Part of the line's main pattern (vs. a leg only some timetabled trips sail). */
  main: boolean;
}

export interface Network {
  lines: LineSpec[];
  inputs: LineInput[];
  paths: Map<string, LinePath>;
}

export interface BerthGeometry {
  id: string;
  alongBearing: number;
  seawardBearing: number;
  /** Berth point (OSM), when known: lets close sibling berths of one pier spread apart for long drawn hulls. */
  lngLat?: LngLat;
}

/** Berths closer than this (m) belong to one pier for spreading (Eminönü 127 m, Beşiktaş 280 m apart). */
const SIBLING_M = 350;

/** Unit vector away from the nearest sibling berth and the distance to it (m), or undefined. */
function berthSpread(b: BerthGeometry, all: BerthGeometry[]): StopBerth['spread'] {
  if (!b.lngLat) return undefined;
  const kx = 111_320 * Math.cos((b.lngLat[1] * Math.PI) / 180);
  let best: [number, number, number] | undefined;
  for (const o of all) {
    if (o.id === b.id || !o.lngLat) continue;
    const dx = (b.lngLat[0] - o.lngLat[0]) * kx;
    const dy = (b.lngLat[1] - o.lngLat[1]) * 110_574;
    const d = Math.hypot(dx, dy);
    if (d > 0 && d < SIBLING_M && (!best || d < best[2])) best = [dx / d, dy / d, d];
  }
  return best;
}

/**
 * Join line specs with their route legs; leg lengths come from the geometry itself.
 * `berths` (from piers.geojson) adds per-stop docking geometry (abreast slots are per stay: berths.ts).
 */
export function buildNetwork(lines: LineSpec[], routes: FeatureCollection<LineString, RouteProps>, refLat: number, berths: BerthGeometry[] = []): Network {
  const berthById = new Map(berths.map((b) => [b.id, b]));
  const paths = new Map<string, LinePath>();
  const inputs: LineInput[] = lines.map((line) => {
    const legs: LegSpec[] = [];
    const geoms = [];
    const stopPoint: (LngLat | undefined)[] = line.stops.map(() => undefined);
    for (const f of routes.features) {
      if (f.properties.lineId !== line.id) continue;
      const from = line.stops.indexOf(f.properties.from);
      const to = line.stops.indexOf(f.properties.to);
      if (from < 0 || to < 0) throw new Error(`${f.properties.id}: stop not on line ${line.id}`);
      const coords = f.geometry.coordinates as LngLat[];
      const g = legPath(coords, refLat);
      geoms.push(g);
      legs.push({ from, to, length: g.length });
      stopPoint[from] ??= coords[0];
      stopPoint[to] ??= coords[coords.length - 1];
    }
    const missing = line.stops.filter((_, i) => !stopPoint[i]);
    if (missing.length) throw new Error(`${line.id}: no route reaches ${missing.join(', ')}`);
    const p: LinePath = { lineId: line.id, legs: geoms, stopPoint: stopPoint as LngLat[] };
    if (line.berths && line.berths.every((id) => berthById.has(id))) {
      p.berths = line.berths.map((id): StopBerth => {
        const g = berthById.get(id)!;
        return { berthId: id, along: g.alongBearing, seaward: g.seawardBearing, slot: 0, spread: berthSpread(g, berths) };
      });
    }
    paths.set(line.id, p);
    return { line, legs };
  });
  return { lines, inputs, paths };
}
