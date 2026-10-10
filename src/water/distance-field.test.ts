import { describe, expect, it } from 'vitest';
import { distanceTransform } from './distance-field';

describe('distanceTransform', () => {
  it('measures Euclidean distance to the nearest set cell', () => {
    const w = 7;
    const mask = new Uint8Array(w * w);
    mask[3 * w + 3] = 1;
    const d = distanceTransform(mask, w, w);
    expect(d[3 * w + 3]).toBe(0);
    expect(d[3 * w + 6]).toBe(3);
    expect(d[0]).toBeCloseTo(Math.hypot(3, 3), 6);
  });
});
