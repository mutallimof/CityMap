/**
 * Wake trails sampled on a fixed sim-time grid (…, g−2Δ, g−Δ, g where g = floor(t/Δ)·Δ),
 * cached per vessel. Grid points don't move as time advances, so each frame only computes the
 * newest sample(s) and the trail never shimmers. Samples are produced by a pure pose function.
 */
export interface GridSample {
  x: number;
  y: number;
  fx: number;
  fy: number;
  speed: number;
}

export class TrailCache {
  private cache = new Map<string, Map<number, GridSample | null>>();

  constructor(private stepS: number) {}

  /**
   * Samples at grid times strictly before `t`, newest first, `count` of them.
   * `sample(time)` returns null when the vessel wasn't in service.
   */
  get(id: string, t: number, count: number, sample: (time: number) => GridSample | null): GridSample[] {
    let m = this.cache.get(id);
    if (!m) this.cache.set(id, (m = new Map()));
    const g = Math.floor(t / this.stepS);
    const out: GridSample[] = [];
    for (let k = 0; k < count; k++) {
      const key = g - k;
      let s = m.get(key);
      if (s === undefined) {
        s = sample(key * this.stepS);
        m.set(key, s);
      }
      if (!s) break;
      out.push(s);
    }
    // Forget grid points that fell off the end (and anything far in the future after a time jump).
    for (const key of m.keys()) if (key <= g - count || key > g) m.delete(key);
    return out;
  }

  retain(ids: Set<string>): void {
    for (const id of this.cache.keys()) if (!ids.has(id)) this.cache.delete(id);
  }

  clear(): void {
    this.cache.clear();
  }
}
