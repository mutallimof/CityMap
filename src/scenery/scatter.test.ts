import { describe, expect, it } from 'vitest';
import { pointInRing, scatterTrees, type TreeSpot } from './scatter';

const square = (x: number, y: number, s: number): [number, number][] => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
  [x, y],
];

describe('tree scatter', () => {
  it('trees only inside the polygon, not in holes; stable', () => {
    const run = () => {
      const out: TreeSpot[] = [];
      scatterTrees([[square(0, 0, 200), square(50, 50, 100)]], 20, [-1e9, -1e9, 1e9, 1e9], new Set(), out, 1e4);
      return out;
    };
    const a = run();
    expect(a.length).toBeGreaterThan(40);
    for (const t of a) {
      expect(pointInRing(t.x, t.y, square(0, 0, 200))).toBe(true);
      expect(pointInRing(t.x, t.y, square(50, 50, 100))).toBe(false);
    }
    expect(run()).toEqual(a);
  });

  it('a polygon split across tiles gives each tree once; box and max are respected', () => {
    const seen = new Set<string>();
    const out: TreeSpot[] = [];
    scatterTrees([[square(0, 0, 100)]], 10, [-1e9, -1e9, 1e9, 1e9], seen, out, 1e4);
    const n = out.length;
    scatterTrees([[square(0, 0, 100)]], 10, [-1e9, -1e9, 1e9, 1e9], seen, out, 1e4);
    expect(out.length).toBe(n);
    const boxed: TreeSpot[] = [];
    scatterTrees([[square(0, 0, 100)]], 10, [0, 0, 50, 50], new Set(), boxed, 1e4);
    expect(boxed.every((t) => t.x <= 60 && t.y <= 60)).toBe(true);
    const capped: TreeSpot[] = [];
    scatterTrees([[square(0, 0, 100)]], 10, [-1e9, -1e9, 1e9, 1e9], new Set(), capped, 7);
    expect(capped.length).toBe(7);
  });
});
