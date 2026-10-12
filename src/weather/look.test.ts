import { afterEach, describe, expect, it } from 'vitest';
import { setTheme, THEMES } from '../themes/registry';
import { themeAt } from '../time/palette';
import { CALM, demoConditions } from './conditions';
import { lightFactor, weatherPalette } from './look';

const HEX = /^#[0-9a-f]{6}$/i;
const lum = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};
const store = null;

describe('weather palette', () => {
  afterEach(() => void setTheme('classic', { save: false, store }));

  it('leaves a clear sky untouched', () => {
    const p = themeAt(40).palette;
    expect(weatherPalette(p, { ...CALM, cloud: 0 }, 0)).toEqual(p);
  });

  it('greys the sky under rain and whitens the land under snow', () => {
    const p = themeAt(40).palette;
    const rain = weatherPalette(p, demoConditions('rain'), 0);
    expect(rain.sky).not.toBe(p.sky);
    expect(lum(rain.water)).toBeLessThanOrEqual(lum(p.water));
    const snow = weatherPalette(p, demoConditions('snow'), 0);
    expect(lum(snow.land)).toBeGreaterThan(lum(p.land));
  });

  it('gives valid colours in every look, day and night, in every demo weather', () => {
    for (const t of THEMES) {
      setTheme(t.id, { save: false, store });
      for (const night of [0, 1])
        for (const w of ['clear', 'cloudy', 'rain', 'storm', 'fog', 'snow', 'wind'] as const) {
          const p = weatherPalette(themeAt(night ? -20 : 40).palette, demoConditions(w), night);
          for (const k of ['sky', 'horizon', 'fog', 'water', 'waterShallow', 'land'] as const) expect(p[k]).toMatch(HEX);
        }
    }
  });

  it('dims the light, never below 0.35', () => {
    expect(lightFactor({ ...CALM, cloud: 0 })).toBe(1);
    expect(lightFactor(demoConditions('rain'))).toBeLessThan(1);
    expect(lightFactor({ ...CALM, cloud: 1, rain: 1, fog: 1 })).toBe(0.35);
  });
});
