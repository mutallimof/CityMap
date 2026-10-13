/**
 * Which landmass a point is on, from the coastline polygons in `data/land.geojson` (each polygon of the
 * MultiPolygon is one landmass: the European side incl. both shores of the Golden Horn, the Asian side,
 * each island). The planner only offers a walk between two points on the same landmass.
 * A point off every polygon (a pier head over the water, a place mapped on the quay edge) snaps to the
 * nearest polygon within `snapM`; farther out it is on no landmass (null) and never walks. Pure.
 */
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

type LngLat = [number, number];
type Ring = number[][];

interface Mass {
  rings: Ring[];
  /** lng/lat bbox: minX, minY, maxX, maxY. */
  bbox: [number, number, number, number];
}

const KY = 110_574;
const kx = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

function inRing(p: LngLat, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Metres from p to the nearest edge of a ring (local equirectangular). */
function ringDistM(p: LngLat, r: Ring): number {
  const sx = kx(p[1]);
  let best = Infinity;
  for (let i = 0; i + 1 < r.length; i++) {
    const ax = (r[i][0] - p[0]) * sx;
    const ay = (r[i][1] - p[1]) * KY;
    const bx = (r[i + 1][0] - p[0]) * sx;
    const by = (r[i + 1][1] - p[1]) * KY;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

export interface LandIndex {
  /** Landmass id (polygon index) of a point, or null when it is more than `snapM` (default: the index's) off every polygon. */
  landOf(p: LngLat, snapM?: number): number | null;
  /** Both points on one landmass (a walk between them doesn't cross water). */
  sameLand(a: LngLat, b: LngLat): boolean;
}

export function makeLandIndex(fc: FeatureCollection<Polygon | MultiPolygon>, snapM = 100): LandIndex {
  const masses: Mass[] = [];
  for (const f of fc.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const rings of polys) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of rings[0]) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      masses.push({ rings, bbox: [x0, y0, x1, y1] });
    }
  }
  const cache = new Map<string, number | null>();
  const landOf = (p: LngLat, snap = snapM): number | null => {
    const key = `${p[0]},${p[1]},${snap}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let found: number | null = null;
    // Inside a polygon (outer ring, not in a hole) wins.
    for (let i = 0; i < masses.length && found === null; i++) {
      const { rings, bbox } = masses[i];
      if (p[0] < bbox[0] || p[0] > bbox[2] || p[1] < bbox[1] || p[1] > bbox[3]) continue;
      if (inRing(p, rings[0]) && !rings.slice(1).some((h) => inRing(p, h))) found = i;
    }
    if (found === null) {
      // Off every polygon: the nearest edge within snap (piers, quay-edge places, hole edges); a tie keeps the first.
      const padX = snap / kx(p[1]);
      const padY = snap / KY;
      let best = snap;
      for (let i = 0; i < masses.length; i++) {
        const { rings, bbox } = masses[i];
        if (p[0] < bbox[0] - padX || p[0] > bbox[2] + padX || p[1] < bbox[1] - padY || p[1] > bbox[3] + padY) continue;
        for (const r of rings) {
          const d = ringDistM(p, r);
          if (d < best || (found === null && d === best)) {
            best = d;
            found = i;
          }
        }
      }
    }
    if (cache.size > 4000) cache.clear();
    cache.set(key, found);
    return found;
  };
  return {
    landOf,
    sameLand: (a, b) => {
      const la = landOf(a);
      return la !== null && la === landOf(b);
    },
  };
}
