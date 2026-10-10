import { describe, expect, it } from 'vitest';
import { TrailCache } from './trail-cache';

describe('TrailCache', () => {
  it('only computes new grid samples as time advances', () => {
    let calls = 0;
    const sample = (time: number) => (calls++, { x: time, y: 0, fx: 1, fy: 0, speed: 1 });
    const c = new TrailCache(2);
    const a = c.get('v', 100.5, 5, sample);
    expect(a.map((s) => s.x)).toEqual([100, 98, 96, 94, 92]);
    expect(calls).toBe(5);
    c.get('v', 101.9, 5, sample);
    expect(calls).toBe(5); // same grid cell
    const b = c.get('v', 102.1, 5, sample);
    expect(b[0].x).toBe(102);
    expect(calls).toBe(6);
  });

  it('stops at the start of service', () => {
    const c = new TrailCache(1);
    const out = c.get('v', 10, 8, (t) => (t >= 7 ? { x: t, y: 0, fx: 1, fy: 0, speed: 1 } : null));
    expect(out.map((s) => s.x)).toEqual([10, 9, 8, 7]);
  });
});
