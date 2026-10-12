import { describe, expect, it } from 'vitest';
import { look } from '../themes';
import { mixHex, themeAt } from './palette';

describe('palette', () => {
  it('mixes hex colours', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('is day at noon, night at midnight, golden at the horizon', () => {
    expect(themeAt(50).palette.land).toBe(look().colors.day.land.toLowerCase());
    expect(themeAt(50).night).toBe(0);
    expect(themeAt(-20).night).toBe(1);
    expect(themeAt(-20).palette.land).toBe(look().colors.night.land.toLowerCase());
    expect(themeAt(0).golden).toBe(1);
    expect(themeAt(0).night).toBe(0);
  });

  it('changes continuously with elevation', () => {
    let prev = themeAt(30);
    for (let e = 30; e >= -15; e -= 0.1) {
      const t = themeAt(e);
      expect(Math.abs(t.night - prev.night)).toBeLessThan(0.05);
      expect(Math.abs(t.golden - prev.golden)).toBeLessThan(0.05);
      prev = t;
    }
  });
});
