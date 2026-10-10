import { describe, expect, it } from 'vitest';
import { chaikin, chaikinSafe, findPath, rasterize, segmentClearance, stringPull } from './nav-grid';

// 1 km × 1 km sea with a land wall at x∈[400,600] from y=0 to y=800 (gap at the top).
const wall: [number, number][] = [[400, -10], [600, -10], [600, 800], [400, 800], [400, -10]];
const g = rasterize([wall], 1000, 1000, 10);
const opts = { minClear: 30, comfortClear: 150, hugPenalty: 3, endpointRadius: 50 };

describe('nav grid', () => {
  it('rasterises land and measures clearance', () => {
    const at = (x: number, y: number) => Math.floor(y / 10) * g.nx + Math.floor(x / 10);
    expect(g.land[at(500, 400)]).toBe(1);
    expect(g.land[at(300, 400)]).toBe(0);
    expect(g.clear[at(305, 400)]).toBeCloseTo(100, -1);
  });

  it('routes around land, never through it', () => {
    const p = findPath(g, [200, 100], [800, 100], opts)!;
    expect(p).not.toBeNull();
    expect(Math.max(...p.map(([, y]) => y))).toBeGreaterThan(800); // goes round the top of the wall
    for (let i = 1; i < p.length; i++) expect(segmentClearance(g, p[i - 1], p[i])).toBeGreaterThan(0);
  });

  it('string pulling + smoothing keep clearance and endpoints', () => {
    const p = findPath(g, [200, 100], [800, 100], opts)!;
    const rule = { clear: 40, endClear: 30, endRadius: 50, ends: [p[0], p[p.length - 1]] as [[number, number], [number, number]] };
    const pulled = stringPull(g, p, rule);
    expect(pulled.length).toBeLessThan(p.length / 5);
    expect(chaikin([[0, 0], [10, 0], [10, 10]], 1)).toEqual([[0, 0], [7.5, 0], [10, 2.5], [10, 10]]);
    const smooth = chaikinSafe(g, pulled, 4, rule);
    expect(smooth[0]).toEqual([200, 100]);
    expect(smooth[smooth.length - 1]).toEqual([800, 100]);
    for (let i = 1; i < smooth.length; i++) expect(segmentClearance(g, smooth[i - 1], smooth[i])).toBeGreaterThan(20);
  });

  it('returns null when the goal is unreachable', () => {
    const closed = rasterize([[[400, -10], [600, -10], [600, 1010], [400, 1010], [400, -10]]], 1000, 1000, 10);
    expect(findPath(closed, [200, 100], [800, 100], opts)).toBeNull();
  });
});
