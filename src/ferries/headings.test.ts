import { describe, expect, it } from 'vitest';
import { angleDelta, HeadingSmoother, interpolateStops } from './headings';

describe('headings', () => {
  it('takes the short way round', () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
    expect(Math.abs(angleDelta(0, 180))).toBe(180);
  });

  it('smooths toward the target without overshoot or snapping', () => {
    const h = new HeadingSmoother(0.35);
    expect(h.update('a', 350, 1 / 60)).toBe(350);
    let prev = 350;
    for (let i = 0; i < 120; i++) {
      const v = h.update('a', 20, 1 / 60);
      expect(Math.abs(angleDelta(prev, v))).toBeLessThan(5); // ≤ 5° per frame for a 30° turn
      prev = v;
    }
    expect(Math.abs(angleDelta(prev, 20))).toBeLessThan(0.1);
  });

  it('interpolates zoom stops', () => {
    const s = [[11, 4], [13, 3], [16, 1]] as const;
    expect(interpolateStops(s, 10)).toBe(4);
    expect(interpolateStops(s, 12)).toBe(3.5);
    expect(interpolateStops(s, 20)).toBe(1);
  });
});
