import { afterEach, describe, expect, it } from 'vitest';
import { setTheme, THEMES } from '../themes/registry';
import { cityLook, type CityLookInput } from './city-look';

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const lum = (h: string) => {
  const n = parseInt(h.slice(1, 7), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};
const DAY: CityLookInput = { night: 0, golden: 0, season: 'summer', wet: 0, snow: 0, cloud: 0 };
const store = null;

describe('city look', () => {
  afterEach(() => void setTheme('classic', { save: false, store }));

  it('is a pure function of its input', () => {
    expect(cityLook(DAY)).toEqual(cityLook(DAY));
  });

  it('takes vegetation from the season', () => {
    const spring = cityLook({ ...DAY, season: 'spring' });
    const autumn = cityLook({ ...DAY, season: 'autumn' });
    expect(spring.park).not.toBe(autumn.park);
  });

  it('gets darker at night, whiter with snow, darker when wet', () => {
    const day = cityLook(DAY);
    expect(lum(cityLook({ ...DAY, night: 1 }).commercial)).toBeLessThan(lum(day.commercial));
    expect(lum(cityLook({ ...DAY, snow: 1 }).residential[0])).toBeGreaterThan(lum(day.residential[0]));
    expect(lum(cityLook({ ...DAY, wet: 1 }).road)).toBeLessThan(lum(day.road));
  });

  it('keeps light / label colours through overcast', () => {
    const day = cityLook(DAY);
    const grey = cityLook({ ...DAY, cloud: 1 });
    expect(grey.streetLabel).toBe(day.streetLabel);
  });

  it('gives valid colours for every look, every season and blend', () => {
    for (const t of THEMES) {
      setTheme(t.id, { save: false, store });
      for (const season of ['spring', 'summer', 'autumn', 'winter'] as const)
        for (const [night, golden, snow, wet, cloud] of [[0, 0, 0, 0, 0], [0.5, 1, 0.5, 0.5, 0.5], [1, 0, 1, 1, 1]]) {
          const p = cityLook({ night, golden, season, snow, wet, cloud });
          for (const [k, v] of Object.entries(p)) for (const c of Array.isArray(v) ? v : [v]) expect(c, `${t.id} ${k}`).toMatch(HEX);
        }
    }
  });
});
