/**
 * Build land polygons from OSM `natural=coastline` ways inside a bbox.
 *
 * OSM convention: walking along a coastline way, LAND IS ON THE LEFT.
 * Algorithm:
 *   1. Merge ways that share endpoints into chains.
 *   2. Closed chains fully inside the box are islands (or, if clockwise, water holes).
 *   3. Everything else is clipped to the box → pieces that enter and exit through the
 *      box edge. From each exit we walk the box boundary counter-clockwise (which keeps
 *      land on the left) to the next entry, follow that piece, and so on until the ring
 *      closes.
 */
import * as turf from '@turf/turf';
import type { LineString, MultiLineString, Position } from 'geojson';

export type BBox = readonly [number, number, number, number];
export type Ring = Position[];
/** Polygon as rings: [outer, ...holes]. */
export type Poly = Ring[];

const key = (p: Position) => `${p[0]},${p[1]}`;

/** Join ways end-to-start into maximal chains. Each way is used once. */
export function mergeWays(ways: Position[][]): Position[][] {
  const byStart = new Map<string, number[]>();
  ways.forEach((w, i) => {
    const k = key(w[0]);
    byStart.set(k, [...(byStart.get(k) ?? []), i]);
  });
  const used = new Set<number>();
  const takeFrom = (k: string): number | undefined => {
    const list = byStart.get(k);
    const i = list?.find((j) => !used.has(j));
    return i;
  };
  // Ways whose start is some other way's end are not chain heads; start from true heads first.
  const ends = new Set(ways.map((w) => key(w[w.length - 1])));
  const order = ways.map((_, i) => i).sort((a, b) => Number(ends.has(key(ways[a][0]))) - Number(ends.has(key(ways[b][0]))));

  const chains: Position[][] = [];
  for (const i of order) {
    if (used.has(i)) continue;
    used.add(i);
    const chain = [...ways[i]];
    for (;;) {
      const tail = chain[chain.length - 1];
      if (key(tail) === key(chain[0]) && chain.length > 3) break; // closed
      const next = takeFrom(key(tail));
      if (next === undefined) break;
      used.add(next);
      chain.push(...ways[next].slice(1));
    }
    chains.push(chain);
  }
  return chains;
}

/** Position along the box perimeter, increasing counter-clockwise from the SW corner. Range [0, 4). */
export function perimeterT([x, y]: Position, [w, s, e, n]: BBox): number {
  const eps = 1e-9;
  if (Math.abs(y - s) < eps) return (x - w) / (e - w); // south edge, west→east
  if (Math.abs(x - e) < eps) return 1 + (y - s) / (n - s); // east edge, south→north
  if (Math.abs(y - n) < eps) return 2 + (e - x) / (e - w); // north edge, east→west
  if (Math.abs(x - w) < eps) return 3 + (n - y) / (n - s); // west edge, north→south
  return NaN;
}

/** Corner reached at integer perimeter position c (1 = SE, 2 = NE, 3 = NW, 4 = SW). */
function cornerAt(c: number, [w, s, e, n]: BBox): Position {
  const corners: Position[] = [
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ];
  return corners[(((c - 1) % 4) + 4) % 4];
}

/** Box corners passed when walking CCW a distance d from perimeter position t0. */
function cornersAlong(t0: number, d: number, bbox: BBox): Position[] {
  const out: Position[] = [];
  for (let c = Math.floor(t0) + 1; c < t0 + d; c++) out.push(cornerAt(c, bbox));
  return out;
}

function signedArea(ring: Ring): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a / 2;
}

function inside([x, y]: Position, [w, s, e, n]: BBox): boolean {
  return x > w && x < e && y > s && y < n;
}

export interface AssembleResult {
  polygons: Poly[];
  warnings: string[];
}

export function assembleCoastline(ways: Position[][], bbox: BBox, simplify?: (line: Position[]) => Position[]): AssembleResult {
  const warnings: string[] = [];
  const chains = mergeWays(ways);
  const islands: Ring[] = [];
  const holes: Ring[] = [];
  const pieces: Position[][] = [];
  const simp = simplify ?? ((l: Position[]) => l);

  for (const chain of chains) {
    const closed = key(chain[0]) === key(chain[chain.length - 1]);
    if (closed && chain.every((p) => inside(p, bbox))) {
      const ring = simp(chain);
      if (ring.length < 4) continue;
      (signedArea(ring) > 0 ? islands : holes).push(ring);
      continue;
    }
    const clipped = turf.bboxClip(turf.lineString(chain), bbox as [number, number, number, number]).geometry as LineString | MultiLineString;
    const parts: Position[][] = clipped.type === 'LineString' ? [clipped.coordinates] : clipped.coordinates;
    for (const part of parts) {
      if (part.length < 2) continue;
      const t0 = perimeterT(part[0], bbox);
      const t1 = perimeterT(part[part.length - 1], bbox);
      if (Number.isNaN(t0) || Number.isNaN(t1)) {
        warnings.push(`Open coastline chain ends inside the box near ${key(Number.isNaN(t0) ? part[0] : part[part.length - 1])} — incomplete data?`);
        continue;
      }
      pieces.push(simp(part));
    }
  }

  // Stitch pieces into rings by walking the box boundary CCW.
  const remaining = new Set(pieces.map((_, i) => i));
  const startT = pieces.map((p) => perimeterT(p[0], bbox));
  const rings: Ring[] = [];
  while (remaining.size) {
    const first = remaining.values().next().value as number;
    const ring: Ring = [];
    let cur = first;
    for (let guard = 0; guard <= pieces.length; guard++) {
      remaining.delete(cur);
      ring.push(...pieces[cur]);
      const exitT = perimeterT(pieces[cur][pieces[cur].length - 1], bbox);
      // Next entry CCW from the exit (including the first piece, which closes the ring).
      let best = -1;
      let bestD = Infinity;
      for (const j of [...remaining, first]) {
        let d = startT[j] - exitT;
        if (d < 0) d += 4;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      ring.push(...cornersAlong(exitT, bestD, bbox));
      if (best === first) break;
      cur = best;
    }
    ring.push(ring[0]);
    rings.push(ring);
  }

  const outers = [...rings, ...islands];
  const polygons: Poly[] = outers.map((r) => [r]);
  for (const h of holes) {
    const owner = polygons.find((p) => turf.booleanPointInPolygon(h[0], turf.polygon([p[0]])));
    if (owner) owner.push(h);
    else warnings.push('Clockwise closed coastline not inside any land polygon — ignored.');
  }
  // No pieces and no islands: the box is all water (fine) — callers can sanity-check.
  return { polygons, warnings };
}
