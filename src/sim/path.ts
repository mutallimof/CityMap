/**
 * Route geometry → position/heading at a distance along a leg. Pure; no map dependency.
 * Distances use a local equirectangular projection (≈0.1% accurate over our area).
 */
import type { Direction } from './types';

export type LngLat = [number, number];

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LON_EQ = 111_320;

export interface LegPath {
  coords: LngLat[];
  /** Cumulative metres at each vertex; cum[0] = 0. */
  cum: number[];
  length: number;
  kx: number; // metres per degree lon at this latitude
}

export interface LinePath {
  lineId: string;
  legs: LegPath[];
}

export function legPath(coords: LngLat[], refLat = coords[0][1]): LegPath {
  const kx = M_PER_DEG_LON_EQ * Math.cos((refLat * Math.PI) / 180);
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    const dx = (coords[i][0] - coords[i - 1][0]) * kx;
    const dy = (coords[i][1] - coords[i - 1][1]) * M_PER_DEG_LAT;
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  return { coords, cum, length: cum[cum.length - 1], kx };
}

/** Split a whole-line LineString at the stop vertices into legs. */
export function linePath(lineId: string, coords: LngLat[], stopVertex: number[], refLat?: number): LinePath {
  const legs: LegPath[] = [];
  for (let k = 0; k < stopVertex.length - 1; k++) legs.push(legPath(coords.slice(stopVertex[k], stopVertex[k + 1] + 1), refLat));
  return { lineId, legs };
}

function segmentAt(p: LegPath, d: number): number {
  let lo = 0;
  let hi = p.cum.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (p.cum[mid] <= d) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Point at distance `d` from the leg's outbound start (clamped). */
export function pointAt(p: LegPath, d: number): LngLat {
  const dd = Math.max(0, Math.min(p.length, d));
  const i = segmentAt(p, dd);
  const span = p.cum[i + 1] - p.cum[i] || 1;
  const t = (dd - p.cum[i]) / span;
  const [x0, y0] = p.coords[i];
  const [x1, y1] = p.coords[i + 1];
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
}

/** Compass bearing (0 = north, clockwise) of the outbound tangent, averaged over ±`window` m. */
export function bearingAt(p: LegPath, d: number, window = 15): number {
  const a = pointAt(p, Math.min(d - window, p.length - 2 * window));
  const b = pointAt(p, Math.max(d + window, 2 * window));
  const dx = (b[0] - a[0]) * p.kx;
  const dy = (b[1] - a[1]) * M_PER_DEG_LAT;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

export interface Pose {
  lngLat: LngLat;
  /** Direction of travel (compass degrees). */
  bearing: number;
}

/**
 * Pose `distance` metres into the leg in the given direction of travel.
 * Inbound legs run the outbound geometry backwards.
 */
export function poseOnLeg(p: LegPath, distance: number, direction: Direction, window?: number): Pose {
  const d = direction === 'out' ? distance : p.length - distance;
  const b = bearingAt(p, d, window);
  return { lngLat: pointAt(p, d), bearing: direction === 'out' ? b : (b + 180) % 360 };
}
