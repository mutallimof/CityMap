/**
 * Where decorative trees stand: on a world-fixed jittered grid inside real OSM woods / parks / gardens
 * (polygons from the map tiles). Same input → same trees (no flicker when tiles reload or the map
 * moves); a polygon split across tiles gives each grid cell once. Pure.
 */
export interface TreeSpot {
  x: number;
  y: number;
  /** 0–1 stable per tree (size / colour variety). */
  r: number;
}

function hash2(x: number, y: number, s = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function pointInRing(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Polygon (outer ring + holes) in local metres → trees on a `spacing` grid (cells keyed globally), within `box`. */
export function scatterTrees(polys: [number, number][][][], spacing: number, box: [number, number, number, number], seen: Set<string>, out: TreeSpot[], max: number): void {
  for (const poly of polys) {
    const outer = poly[0];
    if (!outer || outer.length < 3) continue;
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of outer) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    x0 = Math.max(x0, box[0]);
    y0 = Math.max(y0, box[1]);
    x1 = Math.min(x1, box[2]);
    y1 = Math.min(y1, box[3]);
    for (let gx = Math.floor(x0 / spacing); gx <= Math.floor(x1 / spacing); gx++)
      for (let gy = Math.floor(y0 / spacing); gy <= Math.floor(y1 / spacing); gy++) {
        if (out.length >= max) return;
        const key = `${spacing}:${gx}:${gy}`;
        if (seen.has(key)) continue;
        const x = (gx + 0.15 + 0.7 * hash2(gx, gy, 1)) * spacing;
        const y = (gy + 0.15 + 0.7 * hash2(gx, gy, 2)) * spacing;
        if (!pointInRing(x, y, outer) || poly.slice(1).some((h) => pointInRing(x, y, h))) continue;
        seen.add(key);
        out.push({ x, y, r: hash2(gx, gy, 3) });
      }
  }
}
