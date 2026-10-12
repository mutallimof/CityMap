import { describe, expect, it } from 'vitest';
import { distanceTransform, waterShare } from './distance-field';

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

describe('waterShare', () => {
  const bounds = [29, 41, 29.1, 41.1] as const;
  // 10×10 field, row 0 = south: west half land (0), east half water.
  const data = new Uint8Array(100);
  for (let y = 0; y < 10; y++) for (let x = 5; x < 10; x++) data[y * 10 + x] = 200;
  const field = { data, width: 10, height: 10 };
  it('is 0 inland, 1 out on the water, about half on the shore', () => {
    expect(waterShare(field, bounds, 29.02, 41.05, 300)).toBe(0);
    expect(waterShare(field, bounds, 29.08, 41.05, 300)).toBe(1);
    const shore = waterShare(field, bounds, 29.05, 41.05, 3000);
    expect(shore).toBeGreaterThan(0.3);
    expect(shore).toBeLessThan(0.7);
  });
  it('counts outside the field as land', () => {
    expect(waterShare(field, bounds, 30, 41.05, 300)).toBe(0);
  });
});
