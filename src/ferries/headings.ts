/** Shortest signed angle from a to b, degrees in [-180, 180). */
export function angleDelta(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

/**
 * Per-vessel exponential heading smoothing (real-time constant `tau` seconds), so a
 * changing path tangent never shows up as a snap. Forgets vessels that left service.
 */
export class HeadingSmoother {
  private current = new Map<string, number>();

  constructor(private tau: number) {}

  update(id: string, target: number, dtSeconds: number): number {
    const cur = this.current.get(id);
    if (cur === undefined) {
      this.current.set(id, target);
      return target;
    }
    const k = 1 - Math.exp(-dtSeconds / this.tau);
    const next = (cur + angleDelta(cur, target) * k + 360) % 360;
    this.current.set(id, next);
    return next;
  }

  retain(ids: Set<string>): void {
    for (const id of this.current.keys()) if (!ids.has(id)) this.current.delete(id);
  }
}

/** Piecewise-linear interpolation over [x, y] stops (clamped). */
export function interpolateStops(stops: readonly (readonly [number, number])[], x: number): number {
  if (x <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [x0, y0] = stops[i - 1];
      const [x1, y1] = stops[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return stops[stops.length - 1][1];
}
