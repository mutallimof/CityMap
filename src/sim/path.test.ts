import { describe, expect, it } from 'vitest';
import { bearingAt, legPath, linePath, pointAt, poseOnLeg } from './path';

// 0.01° north ≈ 1105.7 m; then 0.01° east at lat 41 ≈ 840 m.
const L = legPath([[29, 41], [29, 41.01], [29.01, 41.01]], 41);

describe('path', () => {
  it('measures length in metres', () => {
    expect(L.cum[1]).toBeCloseTo(1105.7, 0);
    expect(L.length).toBeCloseTo(1105.7 + 840.1, 0);
  });

  it('interpolates points and clamps', () => {
    expect(pointAt(L, 0)).toEqual([29, 41]);
    expect(pointAt(L, -10)).toEqual([29, 41]);
    expect(pointAt(L, L.length + 10)).toEqual([29.01, 41.01]);
    const mid = pointAt(L, L.cum[1] / 2);
    expect(mid[1]).toBeCloseTo(41.005, 6);
  });

  it('gives compass bearings, smoothed around corners', () => {
    expect(bearingAt(L, 200)).toBeCloseTo(0, 3);
    expect(bearingAt(L, L.length - 200)).toBeCloseTo(90, 3);
    const corner = bearingAt(L, L.cum[1]);
    expect(corner).toBeGreaterThan(10);
    expect(corner).toBeLessThan(80);
  });

  it('runs inbound legs backwards', () => {
    const out = poseOnLeg(L, 100, 'out');
    const back = poseOnLeg(L, L.length - 100, 'back');
    expect(back.lngLat[0]).toBeCloseTo(out.lngLat[0], 9);
    expect(back.lngLat[1]).toBeCloseTo(out.lngLat[1], 9);
    expect(back.bearing).toBeCloseTo((out.bearing + 180) % 360, 6);
  });

  it('splits a line at its stop vertices', () => {
    const lp = linePath('x', [[29, 41], [29, 41.01], [29.01, 41.01]], [0, 1, 2]);
    expect(lp.legs).toHaveLength(2);
    expect(lp.legs[0].coords).toHaveLength(2);
  });
});
