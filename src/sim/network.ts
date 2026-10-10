import type { FeatureCollection, LineString } from 'geojson';
import { linePath, type LinePath, type LngLat } from './path';
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

/** Join line specs with their route geometry; leg lengths come from the geometry itself. */
export function buildNetwork(lines: LineSpec[], routes: FeatureCollection<LineString, RouteProps>, refLat: number): Network {
  const byId = new Map(routes.features.map((f) => [f.properties.id, f]));
  const paths = new Map<string, LinePath>();
  const inputs: LineInput[] = lines.map((line) => {
    const r = byId.get(line.routeId);
    if (!r) throw new Error(`${line.id}: route ${line.routeId} missing`);
    if (r.properties.stopVertex.length !== line.stops.length) throw new Error(`${line.id}: route stops don't match line stops`);
    const p = linePath(line.id, r.geometry.coordinates as LngLat[], r.properties.stopVertex, refLat);
    paths.set(line.id, p);
    return { line, geometry: { legLengths: p.legs.map((l) => l.length) } };
  });
  return { lines, inputs, paths };
}
