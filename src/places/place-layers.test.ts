import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { setTheme } from '../themes/registry';
import { featuredSize } from './place-layers';

const store = null;

/** Evaluates the size expression (interpolate-linear over zoom of `case` on rank) for one rank. */
function sizeAt(expr: unknown[], z: number, rank: number): number {
  const stops: [number, number][] = [];
  for (let i = 3; i < expr.length; i += 2) {
    const v = expr[i + 1];
    let val: number;
    if (typeof v === 'number') val = v;
    else {
      const c = v as unknown[];
      val = c[c.length - 1] as number;
      for (let k = 1; k < c.length - 1; k += 2) if ((c[k] as unknown[])[2] === rank) val = c[k + 1] as number;
    }
    stops.push([expr[i] as number, val]);
  }
  if (z <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [z1, v1] = stops[i];
    const [z0, v0] = stops[i - 1];
    if (z <= z1) return v0 + ((z - z0) / (z1 - z0)) * (v1 - v0);
  }
  return stops[stops.length - 1][1];
}

describe('featured pin size', () => {
  afterEach(() => void setTheme('classic', { save: false, store }));

  it('Classic pins grow smoothly with zoom, no bounce', () => {
    setTheme('classic', { save: false, store });
    const e = featuredSize() as unknown[];
    expect(sizeAt(e, 10, 1)).toBeCloseTo(0.72);
    expect(sizeAt(e, 14, 1)).toBeCloseTo(0.9);
    expect(sizeAt(e, 18, 1)).toBeCloseTo(1);
  });

  it('bubble pins bounce in as their rank appears and settle within 0.4 zoom', () => {
    setTheme('toy', { save: false, store });
    const e = featuredSize() as unknown[];
    const [z1, z2] = CONFIG.places.rankZooms;
    for (const [rank, az] of [[1, z1], [2, z2]] as const) {
      const peak = sizeAt(e, az + 0.18, rank);
      const settled = sizeAt(e, az + 0.4, rank);
      expect(peak / settled).toBeGreaterThan(1.12);
      expect(sizeAt(e, az + 0.6, rank)).toBeCloseTo(sizeAt(e, az + 0.6, 0), 2);
    }
    // well-known pins (rank 0) never bounce: size only grows with zoom
    let prev = 0;
    for (let z = 10; z <= 17; z += 0.05) {
      const s = sizeAt(e, z, 0);
      expect(s).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = s;
    }
  });
});
