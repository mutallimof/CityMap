/**
 * Navigation grid for route generation: land raster → clearance (distance to land, m) →
 * A* that prefers open water → line-of-sight string pulling → Chaikin smoothing.
 * All geometry in local metres (see local-proj.ts).
 */

export interface Grid {
  nx: number;
  ny: number;
  cell: number; // m
  /** 1 = land. */
  land: Uint8Array;
  /** Distance to nearest land cell centre (m). */
  clear: Float32Array;
}

type XY = [number, number];

/** Rasterise polygons (rings in local metres; even-odd over all rings) into a land mask. */
export function rasterize(rings: XY[][], width: number, height: number, cell: number): Grid {
  const nx = Math.ceil(width / cell);
  const ny = Math.ceil(height / cell);
  const land = new Uint8Array(nx * ny);
  const xs: number[] = [];
  for (let j = 0; j < ny; j++) {
    const y = (j + 0.5) * cell;
    xs.length = 0;
    for (const ring of rings) {
      for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
        const [x0, y0] = ring[k];
        const [x1, y1] = ring[i];
        if (y0 > y !== y1 > y) xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let p = 0; p + 1 < xs.length; p += 2) {
      const a = Math.max(0, Math.ceil(xs[p] / cell - 0.5));
      const b = Math.min(nx - 1, Math.floor(xs[p + 1] / cell - 0.5));
      for (let i = a; i <= b; i++) land[j * nx + i] = 1;
    }
  }
  return { nx, ny, cell, land, clear: distanceTransform(land, nx, ny, cell) };
}

/** Exact Euclidean distance transform (Felzenszwalb–Huttenlocher), in metres. */
export function distanceTransform(land: Uint8Array, nx: number, ny: number, cell: number): Float32Array {
  const INF = 1e20;
  const f = new Float64Array(Math.max(nx, ny));
  const d = new Float64Array(Math.max(nx, ny));
  const v = new Int32Array(Math.max(nx, ny));
  const z = new Float64Array(Math.max(nx, ny) + 1);
  const g = new Float64Array(nx * ny);
  for (let i = 0; i < nx * ny; i++) g[i] = land[i] ? 0 : INF;

  const dt1 = (n: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) ** 2 + f[v[k]];
    }
  };

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) f[j] = g[j * nx + i];
    dt1(ny);
    for (let j = 0; j < ny; j++) g[j * nx + i] = d[j];
  }
  const out = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) f[i] = g[j * nx + i];
    dt1(nx);
    for (let i = 0; i < nx; i++) out[j * nx + i] = Math.sqrt(d[i]) * cell;
  }
  return out;
}

export const cellOf = (g: Grid, [x, y]: XY): [number, number] => [
  Math.min(g.nx - 1, Math.max(0, Math.floor(x / g.cell))),
  Math.min(g.ny - 1, Math.max(0, Math.floor(y / g.cell))),
];
export const centreOf = (g: Grid, i: number, j: number): XY => [(i + 0.5) * g.cell, (j + 0.5) * g.cell];

export interface PathOptions {
  /** Hard minimum clearance (m) away from the endpoints. */
  minClear: number;
  /** Clearance above which water counts as "open" (no extra cost). */
  comfortClear: number;
  /** Extra cost factor for hugging the coast: step cost × (1 + k·(1 − clear/comfort)). */
  hugPenalty: number;
  /** Within this distance of start/goal the clearance rule is relaxed (approach to the berth). */
  endpointRadius: number;
}

class Heap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    const a = this.ids;
    const k = this.keys;
    let i = a.length;
    a.push(id);
    k.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      a[i] = a[p];
      k[i] = k[p];
      i = p;
    }
    a[i] = id;
    k[i] = key;
  }
  pop(): number {
    const a = this.ids;
    const k = this.keys;
    const top = a[0];
    const lastId = a.pop()!;
    const lastKey = k.pop()!;
    if (a.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= a.length) break;
        if (c + 1 < a.length && k[c + 1] < k[c]) c++;
        if (k[c] >= lastKey) break;
        a[i] = a[c];
        k[i] = k[c];
        i = c;
      }
      a[i] = lastId;
      k[i] = lastKey;
    }
    return top;
  }
}

/** A* over water cells, 8-connected. Returns cell-centre points from start to goal (inclusive of the exact endpoints). */
export function findPath(g: Grid, start: XY, goal: XY, o: PathOptions): XY[] | null {
  const [si, sj] = cellOf(g, start);
  const [gi, gj] = cellOf(g, goal);
  const n = g.nx * g.ny;
  const cost = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const s = sj * g.nx + si;
  const goalId = gj * g.nx + gi;
  const near = (i: number, j: number) => {
    const [x, y] = centreOf(g, i, j);
    return Math.hypot(x - start[0], y - start[1]) < o.endpointRadius || Math.hypot(x - goal[0], y - goal[1]) < o.endpointRadius;
  };
  const passable = (id: number, i: number, j: number) => !g.land[id] && (g.clear[id] >= o.minClear || near(i, j));
  const h = (i: number, j: number) => Math.hypot(i - gi, j - gj) * g.cell;
  cost[s] = 0;
  const heap = new Heap();
  heap.push(s, h(si, sj));
  const DIRS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  while (heap.size) {
    const id = heap.pop();
    if (closed[id]) continue;
    closed[id] = 1;
    if (id === goalId) break;
    const i = id % g.nx;
    const j = (id - i) / g.nx;
    for (const [di, dj] of DIRS) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= g.nx || nj >= g.ny) continue;
      const nid = nj * g.nx + ni;
      if (closed[nid] || !passable(nid, ni, nj)) continue;
      // No corner cutting across land on diagonals.
      if (di && dj && (g.land[j * g.nx + ni] || g.land[nj * g.nx + i])) continue;
      const step = (di && dj ? Math.SQRT2 : 1) * g.cell;
      const hug = 1 + o.hugPenalty * Math.max(0, 1 - g.clear[nid] / o.comfortClear);
      const c = cost[id] + step * hug;
      if (c < cost[nid]) {
        cost[nid] = c;
        from[nid] = id;
        heap.push(nid, c + h(ni, nj));
      }
    }
  }
  if (!closed[goalId]) return null;
  const cells: XY[] = [];
  for (let id = goalId; id !== -1; id = from[id]) cells.push(centreOf(g, id % g.nx, Math.floor(id / g.nx)));
  cells.reverse();
  cells[0] = start;
  cells[cells.length - 1] = goal;
  return cells;
}

/** Minimum clearance sampled along a segment (bilinear-free: nearest cell, every half cell). */
export function segmentClearance(g: Grid, a: XY, b: XY): number {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(len / (g.cell / 2)));
  let min = Infinity;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const [i, j] = cellOf(g, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    min = Math.min(min, g.land[j * g.nx + i] ? 0 : g.clear[j * g.nx + i]);
  }
  return min;
}

/** Clearance requirement at a point: `endClear` within `endRadius` of either endpoint, else `clear`. */
export interface ClearRule {
  clear: number;
  endClear: number;
  endRadius: number;
  ends: [XY, XY];
}

function required(r: ClearRule, [x, y]: XY): number {
  const near = r.ends.some(([ex, ey]) => Math.hypot(x - ex, y - ey) < r.endRadius);
  return near ? r.endClear : r.clear;
}

/** True if every sample along a→b has the clearance the rule requires there. */
export function segmentOk(g: Grid, a: XY, b: XY, r: ClearRule): boolean {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(len / (g.cell / 2)));
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const p: XY = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const [i, j] = cellOf(g, p);
    const c = g.land[j * g.nx + i] ? 0 : g.clear[j * g.nx + i];
    if (c < required(r, p)) return false;
  }
  return true;
}

/** Greedy string pulling: from each anchor jump to the farthest later point visible under the rule. */
export function stringPull(g: Grid, pts: XY[], rule: ClearRule): XY[] {
  const out: XY[] = [pts[0]];
  let a = 0;
  while (a < pts.length - 1) {
    let b = a + 1;
    for (let c = pts.length - 1; c > a + 1; c--) {
      if (segmentOk(g, pts[a], pts[c], rule)) {
        b = c;
        break;
      }
    }
    out.push(pts[b]);
    a = b;
  }
  return out;
}

/** Chaikin corner cutting; endpoints are kept. */
export function chaikin(pts: XY[], iterations: number): XY[] {
  let p = pts;
  for (let it = 0; it < iterations; it++) {
    if (p.length < 3) return p;
    const out: XY[] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [x0, y0] = p[i];
      const [x1, y1] = p[i + 1];
      if (i > 0) out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1]);
      if (i < p.length - 2) out.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

/**
 * Chaikin smoothing that never trades away clearance: a corner is only cut when the new
 * segments still satisfy the rule; otherwise the original corner is kept for that iteration.
 */
export function chaikinSafe(g: Grid, pts: XY[], iterations: number, rule: ClearRule): XY[] {
  let p = pts;
  for (let it = 0; it < iterations; it++) {
    if (p.length < 3) return p;
    const out: XY[] = [p[0]];
    for (let i = 1; i < p.length - 1; i++) {
      const [ax, ay] = p[i - 1];
      const [bx, by] = p[i];
      const [cx, cy] = p[i + 1];
      // Cut points on the two segments around corner b (ends keep their full length).
      const t0 = i === 1 ? 0.5 : 0.75;
      const t1 = i === p.length - 2 ? 0.5 : 0.25;
      const q: XY = [ax + (bx - ax) * t0, ay + (by - ay) * t0];
      const r: XY = [bx + (cx - bx) * t1, by + (cy - by) * t1];
      const prev = out[out.length - 1];
      if (segmentOk(g, prev, q, rule) && segmentOk(g, q, r, rule)) {
        out.push(q, r);
      } else {
        out.push(p[i]);
      }
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}
