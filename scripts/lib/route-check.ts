/**
 * Exact route validation against the coastline (plan §4.6):
 * a route must never touch land, and must stay ≥ `minCoastM` from the coast except within
 * `endExemptM` (along the path) of either end of a leg — the approach into a pier.
 */
import * as turf from '@turf/turf';
import type { FeatureCollection, MultiLineString, MultiPolygon, Polygon, Position } from 'geojson';
import type { LocalProj } from './local-proj';

export interface Violation {
  kind: 'land' | 'coast';
  at: [number, number];
  /** Distance along the leg (m). */
  along: number;
  coastM: number;
}

type Seg = [number, number, number, number];

export class CoastIndex {
  private buckets = new Map<string, Seg[]>();
  constructor(
    shore: MultiLineString,
    private land: FeatureCollection<Polygon | MultiPolygon>,
    private proj: LocalProj,
    private bucket = 200,
  ) {
    for (const line of shore.coordinates) {
      for (let i = 1; i < line.length; i++) {
        const [ax, ay] = proj.toXY(line[i - 1]);
        const [bx, by] = proj.toXY(line[i]);
        const s: Seg = [ax, ay, bx, by];
        for (let x = Math.floor(Math.min(ax, bx) / bucket); x <= Math.floor(Math.max(ax, bx) / bucket); x++)
          for (let y = Math.floor(Math.min(ay, by) / bucket); y <= Math.floor(Math.max(ay, by) / bucket); y++) {
            const k = `${x},${y}`;
            const list = this.buckets.get(k);
            if (list) list.push(s);
            else this.buckets.set(k, [s]);
          }
      }
    }
  }

  /** Distance (m) to the nearest coast segment, searched up to `maxM` (returns maxM if none closer). */
  coastDistance([px, py]: [number, number], maxM: number): number {
    let best = maxM;
    const r = Math.ceil(maxM / this.bucket);
    const bx = Math.floor(px / this.bucket);
    const by = Math.floor(py / this.bucket);
    for (let x = bx - r; x <= bx + r; x++)
      for (let y = by - r; y <= by + r; y++)
        for (const [ax, ay, cx, cy] of this.buckets.get(`${x},${y}`) ?? []) {
          const dx = cx - ax;
          const dy = cy - ay;
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1e-9)));
          best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
        }
    return best;
  }

  inLand(lngLat: Position): boolean {
    return this.land.features.some((f) => turf.booleanPointInPolygon(lngLat, f));
  }

  /** Check one leg (pier → pier) sampled every `stepM`. */
  checkLeg(coords: Position[], minCoastM: number, endExemptM: number, stepM = 5): { violations: Violation[]; minCoastM: number; length: number } {
    const xy = coords.map((c) => this.proj.toXY(c));
    const cum = [0];
    for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
    const length = cum[cum.length - 1];
    const violations: Violation[] = [];
    let minSeen = Infinity;
    let seg = 0;
    for (let s = 0; s <= length; s += stepM) {
      while (seg < xy.length - 2 && cum[seg + 1] < s) seg++;
      const t = (s - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
      const p: [number, number] = [xy[seg][0] + (xy[seg + 1][0] - xy[seg][0]) * t, xy[seg][1] + (xy[seg + 1][1] - xy[seg][1]) * t];
      const ll = this.proj.toLngLat(p);
      const d = this.coastDistance(p, Math.max(minCoastM * 2, 100));
      const exempt = s < endExemptM || length - s < endExemptM;
      if (!exempt) minSeen = Math.min(minSeen, d);
      // A path can only get inland by crossing the coast, and with 5 m sampling some sample lies
      // within 5 m of that crossing — so testing near-coast samples (and exempt ends) is enough.
      if ((d < 15 || exempt) && this.inLand(ll)) violations.push({ kind: 'land', at: ll, along: s, coastM: d });
      else if (!exempt && d < minCoastM) violations.push({ kind: 'coast', at: ll, along: s, coastM: d });
    }
    return { violations, minCoastM: minSeen, length };
  }
}
