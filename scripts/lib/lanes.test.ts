import { describe, expect, it } from 'vitest';
import { laneIndices, laneOf, polylineLength, resample, type XY } from './lanes';
import { featuredRank } from '../../src/places/place-layers';

const opts = { offsetM: 30, taperStartM: 100, taperEndM: 400, minCoastM: 60, stepM: 10, smoothN: 10, roundN: 5 };
const straight: XY[] = [
  [0, 0],
  [3000, 0],
];
const open = () => 1000;

describe('route lanes', () => {
  it('keeps both berths exact and shifts to the right of travel mid-leg', () => {
    const east = laneOf(straight, open, opts).pts;
    expect(east[0]).toEqual([0, 0]);
    expect(east[east.length - 1]).toEqual([3000, 0]);
    const mid = resample(east, 5).find((p) => Math.abs(p[0] - 1500) < 5)!;
    expect(mid[1]).toBeCloseTo(-30, 0); // travelling east, right = south
    const west = laneOf([...straight].reverse(), open, opts).pts;
    expect(resample(west, 5).find((p) => Math.abs(p[0] - 1500) < 5)![1]).toBeCloseTo(30, 0); // the other direction: north
  });

  it('eases in: no shift within taperStart of a berth', () => {
    const lane = laneOf(straight, open, opts).pts;
    for (const p of resample(lane, 5)) if (p[0] < 90 || p[0] > 2910) expect(Math.abs(p[1])).toBeLessThan(1);
  });

  it('never comes closer to land than minCoast (shift limited by clearance)', () => {
    const lane = laneOf(straight, () => 75, opts);
    expect(lane.maxShift).toBeLessThanOrEqual(15 + 1e-9);
  });

  it('only adds a little length on a straight leg', () => {
    expect(polylineLength(laneOf(straight, open, opts).pts)).toBeLessThan(3000 * 1.01);
  });

  it('gives lines that share water different lane indices', () => {
    const a = { id: 'a', legs: [straight] };
    const b = { id: 'b', legs: [[[0, 20], [3000, 20]] as XY[]] };
    const c = { id: 'c', legs: [[[0, 5000], [3000, 5000]] as XY[]] };
    expect([...laneIndices([a, b, c], 90, 400)]).toEqual([['a', 0], ['b', 1], ['c', 0]]);
  });
});

describe('featured pin rank (zoomed out)', () => {
  it('well known, events today and filter matches first; curated before auto-picked', () => {
    expect(featuredRank({ major: true }, false, false)).toBe(0);
    expect(featuredRank({ auto: true }, false, true)).toBe(0);
    expect(featuredRank({ auto: true }, true, false)).toBe(0);
    expect(featuredRank({}, false, false)).toBe(1);
    expect(featuredRank({ auto: true }, false, false)).toBe(2);
  });
});
