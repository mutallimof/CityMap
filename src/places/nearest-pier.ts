/**
 * The pier a place sheet / the location button offers as "nearest": the closest served pier in a straight
 * line, but only one on the same landmass as the point (src/plan/land.ts, the planner's snapping: the point
 * within `walk.snapM` of the coastline or of one of our piers, the pier within `walk.pierSnapM`), so a place
 * on one shore never names a pier across the water. A point on no landmass (open water, an islet off the
 * simplified coast) gets no pier. Without land data (`landOf` absent) it is plain straight-line. Pure.
 */
import { CONFIG } from '../config';
import { pointMass } from '../plan/land';
import { distanceM } from './store';

type LngLat = [number, number];

export interface PierPoint {
  id: string;
  lngLat: LngLat;
}

export interface NearestPier {
  /** '' = none on the point's landmass. */
  id: string;
  distance: number;
}

export function nearestPierOnLand(
  p: LngLat,
  piers: readonly PierPoint[],
  landOf?: (q: LngLat, snapM: number) => number | null,
): NearestPier {
  const { snapM, pierSnapM } = CONFIG.plan.walk;
  const mass = landOf ? pointMass(landOf, p, piers, snapM, pierSnapM, distanceM) : undefined;
  let best: NearestPier = { id: '', distance: Infinity };
  if (mass === null) return best;
  for (const x of piers) {
    const d = distanceM(p, x.lngLat);
    if (d >= best.distance) continue;
    if (landOf && landOf(x.lngLat, pierSnapM) !== mass) continue;
    best = { id: x.id, distance: d };
  }
  return best;
}

/** Same landmass test for a pier and a place (the pier sheet's "Nearby" list). */
export function onPierLand(pier: LngLat, place: LngLat, piers: readonly PierPoint[], landOf: (q: LngLat, snapM: number) => number | null): boolean {
  const { snapM, pierSnapM } = CONFIG.plan.walk;
  const a = landOf(pier, pierSnapM);
  return a !== null && a === pointMass(landOf, place, piers, snapM, pierSnapM, distanceM);
}
