/**
 * Traffic lanes for ferry routes: a directed copy of a leg's centreline, shifted to the right of the
 * direction of travel (ships keep to starboard), so the two directions of a leg — and different lines
 * sharing the same water — run side by side instead of on top of each other.
 * The shift is 0 at both berths and eases in/out (smoothstep) over a taper, so docking is unchanged;
 * it never brings the lane closer than `minCoastM` to land (clamped by the centreline's clearance,
 * then min-filtered + averaged, which keeps it smooth and never above the clamp). Pure.
 */
export type XY = [number, number];

export interface LaneOptions {
  /** Shift (m) to the right of travel. */
  offsetM: number;
  /** No shift within this distance of either end (m) … */
  taperStartM: number;
  /** … full shift from this distance (m). */
  taperEndM: number;
  /** Keep at least this far from land (m). */
  minCoastM: number;
  /** Resampling step (m). */
  stepM: number;
  /** Smoothing window half-width of the shift (samples). */
  smoothN: number;
  /** Corner rounding: moving average of the lane points over ±roundN samples (0 = off). */
  roundN?: number;
}

const smoothstep = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function polylineLength(pts: XY[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/** Evenly spaced points along a polyline (keeps both ends exactly). */
export function resample(pts: XY[], step: number): XY[] {
  const out: XY[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    let d = step - carry;
    while (d < len) {
      const t = d / len;
      out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
      d += step;
    }
    carry = len - (d - step);
  }
  const last = pts[pts.length - 1];
  const prev = out[out.length - 1];
  if (Math.hypot(last[0] - prev[0], last[1] - prev[1]) < step * 0.3 && out.length > 1) out[out.length - 1] = last;
  else out.push(last);
  return out;
}

function windowMin(v: number[], n: number): number[] {
  return v.map((_, i) => {
    let m = Infinity;
    for (let j = Math.max(0, i - n); j <= Math.min(v.length - 1, i + n); j++) m = Math.min(m, v[j]);
    return m;
  });
}

function windowMean(v: number[], n: number): number[] {
  return v.map((_, i) => {
    let s = 0;
    let k = 0;
    for (let j = Math.max(0, i - n); j <= Math.min(v.length - 1, i + n); j++) {
      s += v[j];
      k++;
    }
    return s / k;
  });
}

/** Douglas–Peucker simplification (tolerance m), keeps the ends. */
export function simplify(pts: XY[], tol: number): XY[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * The lane for travelling along `centre` (first point → last point). `clearAt` = distance to land (m)
 * at a point. Returns the shifted polyline and the largest shift applied.
 */
export function laneOf(centre: XY[], clearAt: (p: XY) => number, o: LaneOptions): { pts: XY[]; maxShift: number } {
  const p = resample(centre, o.stepM);
  const n = p.length;
  if (n < 3 || o.offsetM <= 0) return { pts: centre, maxShift: 0 };
  const s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const L = s[n - 1];
  // Local bend radius (turn of the tangent over ±4 samples): shifting a bend inwards by more than
  // about half its radius would make it sharp, so the shift stays below that.
  const heading = (i: number) => {
    const a = p[Math.max(0, i - 1)];
    const b = p[Math.min(n - 1, i + 1)];
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  const radius = p.map((_, i) => {
    const a = Math.max(0, i - 4);
    const b = Math.min(n - 1, i + 4);
    const turn = Math.abs(((heading(b) - heading(a) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    return turn < 1e-6 ? Infinity : (s[b] - s[a]) / turn;
  });
  const want = p.map((pt, i) => {
    const taper = Math.min(smoothstep((s[i] - o.taperStartM) / (o.taperEndM - o.taperStartM)), smoothstep((L - s[i] - o.taperStartM) / (o.taperEndM - o.taperStartM)));
    return Math.max(0, Math.min(o.offsetM * taper, clearAt(pt) - o.minCoastM, radius[i] * 0.5));
  });
  const shift = windowMean(windowMin(want, o.smoothN), o.smoothN);
  shift[0] = shift[n - 1] = 0;
  const k = 3; // tangent over ±k samples (smooth normals)
  const out: XY[] = p.map((pt, i) => {
    const a = p[Math.max(0, i - k)];
    const b = p[Math.min(n - 1, i + k)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    // Right of travel in x-east / y-north coordinates: (ty, −tx).
    return [pt[0] + (ty / len) * shift[i], pt[1] - (tx / len) * shift[i]];
  });
  // Round off leftover corners (e.g. where the centreline turns onto a berth approach): average the
  // lane over ±roundN samples, blended out within the first/last `taperStartM` so berths stay exact.
  const r = o.roundN ?? 0;
  const round: XY[] = out.map((pt, i) => {
    if (r === 0) return pt;
    let sx = 0;
    let sy = 0;
    let k = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(n - 1, i + r); j++) {
      sx += out[j][0];
      sy += out[j][1];
      k++;
    }
    const w = Math.min(smoothstep(s[i] / o.taperStartM), smoothstep((L - s[i]) / o.taperStartM));
    return [pt[0] + (sx / k - pt[0]) * w, pt[1] + (sy / k - pt[1]) * w];
  });
  round[0] = centre[0];
  round[n - 1] = centre[centre.length - 1];
  return { pts: simplify(round, 0.5), maxShift: Math.max(...shift) };
}

/** Metres of `a` (sampled every `step`) lying within `near` m of polyline `b`. */
export function sharedLength(a: XY[], b: XY[], near: number, step = 20): number {
  const pa = resample(a, step);
  const pb = resample(b, step);
  let shared = 0;
  for (const q of pa) {
    for (const r of pb) {
      if (Math.abs(q[0] - r[0]) < near && Math.abs(q[1] - r[1]) < near && Math.hypot(q[0] - r[0], q[1] - r[1]) < near) {
        shared += step;
        break;
      }
    }
  }
  return shared;
}

/**
 * Lane index per line: lines whose routes share water (> `minShared` m within `near` m) get
 * different indices (greedy, in the given order), so their lanes sit at different distances.
 */
export function laneIndices(lines: { id: string; legs: XY[][] }[], near: number, minShared: number): Map<string, number> {
  const idx = new Map<string, number>();
  for (const l of lines) {
    const taken = new Set<number>();
    for (const other of lines) {
      if (!idx.has(other.id)) continue;
      let shared = 0;
      for (const a of l.legs) for (const b of other.legs) shared += sharedLength(a, b, near);
      if (shared > minShared) taken.add(idx.get(other.id)!);
    }
    let k = 0;
    while (taken.has(k)) k++;
    idx.set(l.id, k);
  }
  return idx;
}
