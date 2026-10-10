import { describe, expect, it } from 'vitest';
import { distanceAt, kmhToMs, legProfile, speedAt } from './motion';

const v = kmhToMs(24);

describe('legProfile', () => {
  it('trapezoid: duration = L/v + ramp', () => {
    const p = legProfile(3200, v, 60);
    expect(p.duration).toBeCloseTo(3200 / v + 60);
    expect(p.peakSpeed).toBe(v);
  });

  it('short legs lower the peak speed but keep both ramps', () => {
    const p = legProfile(200, v, 60);
    expect(p.peakSpeed).toBeLessThan(v);
    expect(p.duration).toBe(120);
  });
});

describe.each([3200, 500, 200])('motion along a %i m leg', (L) => {
  const p = legProfile(L, v, 60);
  const dt = 0.25;

  it('starts at 0 at rest and ends at L at rest', () => {
    expect(distanceAt(p, 0)).toBe(0);
    expect(distanceAt(p, p.duration)).toBe(L);
    expect(distanceAt(p, -5)).toBe(0);
    expect(distanceAt(p, p.duration + 5)).toBe(L);
    expect(speedAt(p, 0)).toBe(0);
    expect(speedAt(p, p.duration)).toBe(0);
    expect(speedAt(p, 1)).toBeLessThan(0.01 * p.peakSpeed + 0.01);
  });

  it('is monotonic, continuous, and speed is its derivative', () => {
    let prevD = 0;
    let prevS = 0;
    for (let t = dt; t <= p.duration; t += dt) {
      const d = distanceAt(p, t);
      const s = speedAt(p, t);
      expect(d).toBeGreaterThanOrEqual(prevD - 1e-9);
      // No teleporting: never faster than peak speed.
      expect(d - prevD).toBeLessThanOrEqual(p.peakSpeed * dt + 1e-6);
      // Finite-difference speed ≈ reported speed.
      expect((d - prevD) / dt).toBeCloseTo((s + prevS) / 2, 1);
      // Smooth acceleration: speed changes by at most peak·π/(2·ramp) per second.
      expect(Math.abs(s - prevS)).toBeLessThanOrEqual(((p.peakSpeed * Math.PI) / (2 * p.ramp)) * dt + 1e-6);
      prevD = d;
      prevS = s;
    }
  });
});
