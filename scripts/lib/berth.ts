import * as turf from '@turf/turf';
import type { FeatureCollection, MultiLineString, MultiPolygon, Polygon } from 'geojson';
import { bearingOf, type LocalProj } from './local-proj';

export interface Berth {
  /** In-water point where the vessel lies alongside. */
  lngLat: [number, number];
  /** Coast-parallel bearing at the berth (degrees; the vessel may face either way). */
  alongBearing: number;
  /** Bearing from the coast towards open water. */
  seawardBearing: number;
  /** Distance from the OSM feature to the coast (m) — sanity info. */
  osmToCoastM: number;
}

/**
 * Berth = nearest shoreline point to the OSM terminal, pushed `offsetM` out along the
 * water-side normal. Terminal points are often on land (buildings) and our coastline
 * drops narrow jetties, so we never use the raw OSM point as the berth.
 */
export function computeBerth(
  osmPoint: [number, number],
  shore: MultiLineString,
  land: FeatureCollection<Polygon | MultiPolygon>,
  proj: LocalProj,
  offsetM: number,
): Berth {
  const [px, py] = proj.toXY(osmPoint);
  let best = { d2: Infinity, cx: 0, cy: 0, tx: 0, ty: 0 };
  for (const line of shore.coordinates) {
    let prev = proj.toXY(line[0]);
    for (let i = 1; i < line.length; i++) {
      const cur = proj.toXY(line[i]);
      const dx = cur[0] - prev[0];
      const dy = cur[1] - prev[1];
      const len2 = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((px - prev[0]) * dx + (py - prev[1]) * dy) / len2));
      const cx = prev[0] + t * dx;
      const cy = prev[1] + t * dy;
      const d2 = (px - cx) ** 2 + (py - cy) ** 2;
      if (d2 < best.d2) {
        const len = Math.sqrt(len2);
        best = { d2, cx, cy, tx: dx / len, ty: dy / len };
      }
      prev = cur;
    }
  }
  const inLand = (xy: [number, number]) => land.features.some((f) => turf.booleanPointInPolygon(proj.toLngLat(xy), f));
  // Rings keep land on the left, so the right-hand normal points to water; verify anyway.
  let nx = best.ty;
  let ny = -best.tx;
  if (inLand([best.cx + nx * 5, best.cy + ny * 5])) {
    nx = -nx;
    ny = -ny;
  }
  const b: [number, number] = [best.cx + nx * offsetM, best.cy + ny * offsetM];
  return {
    lngLat: proj.toLngLat(b).map((v) => Number(v.toFixed(6))) as [number, number],
    alongBearing: Math.round(bearingOf(best.tx, best.ty) * 10) / 10,
    seawardBearing: Math.round(bearingOf(nx, ny) * 10) / 10,
    osmToCoastM: Math.round(Math.sqrt(best.d2)),
  };
}
