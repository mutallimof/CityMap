import type { FeatureCollection, LineString } from 'geojson';
import { linePath, type LinePath, type LngLat, type StopBerth } from './path';
import type { LineInput } from './schedule';
import type { LineSpec } from './types';

export interface RouteProps {
  id: string;
  lineId: string;
  color: string;
  stops: string[];
  stopVertex: number[];
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
}

/** Slot for lines sharing one berth: 0 at the quay, then 1, 2, … moored abreast further out. */
export function slotOf(index: number): number {
  return index;
}

/**
 * Join line specs with their route geometry; leg lengths come from the geometry itself.
 * `berths` (from piers.geojson) adds per-stop docking geometry and shared-berth slots.
 */
export function buildNetwork(
  lines: LineSpec[],
  routes: FeatureCollection<LineString, RouteProps>,
  refLat: number,
  berths: BerthGeometry[] = [],
): Network {
  const berthById = new Map(berths.map((b) => [b.id, b]));
  const usersOf = new Map<string, string[]>();
  for (const l of lines) for (const b of new Set(l.berths ?? [])) usersOf.set(b, [...(usersOf.get(b) ?? []), l.id].sort());
  const byId = new Map(routes.features.map((f) => [f.properties.id, f]));
  const paths = new Map<string, LinePath>();
  const inputs: LineInput[] = lines.map((line) => {
    const r = byId.get(line.routeId);
    if (!r) throw new Error(`${line.id}: route ${line.routeId} missing`);
    if (r.properties.stopVertex.length !== line.stops.length) throw new Error(`${line.id}: route stops don't match line stops`);
    const p = linePath(line.id, r.geometry.coordinates as LngLat[], r.properties.stopVertex, refLat);
    if (line.berths && line.berths.every((id) => berthById.has(id))) {
      p.berths = line.berths.map((id): StopBerth => {
        const g = berthById.get(id)!;
        return { berthId: id, along: g.alongBearing, seaward: g.seawardBearing, slot: slotOf(usersOf.get(id)!.indexOf(line.id)) };
      });
    }
    paths.set(line.id, p);
    return { line, geometry: { legLengths: p.legs.map((l) => l.length) } };
  });
  return { lines, inputs, paths };
}
