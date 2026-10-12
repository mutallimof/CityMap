import { describe, expect, it } from 'vitest';
import { FOG, weatherIcon } from './icon';
import { demoConditions } from './conditions';

/** A colour emoji on every platform: an emoji-presentation character, or a symbol forced with U+FE0F. */
const isEmoji = (s: string) => /^\p{Emoji_Presentation}$/u.test(s) || (s.endsWith('️') && [...s].length === 2);

describe('weatherIcon', () => {
  it('maps WMO codes to day / night icons', () => {
    expect(weatherIcon(0, false)).toBe('☀️');
    expect(weatherIcon(0, true)).toBe('☾');
    expect(weatherIcon(2, false)).toBe('⛅');
    expect(weatherIcon(3, true)).toBe('☁️');
    expect(weatherIcon(45, false)).toBe(FOG);
    expect(weatherIcon(48, true)).toBe(FOG);
    expect(weatherIcon(61, false)).toBe('🌧️');
    expect(weatherIcon(73, true)).toBe('🌨️');
    expect(weatherIcon(81, false)).toBe('🌦️');
    expect(weatherIcon(86, true)).toBe('🌨️');
    expect(weatherIcon(95, false)).toBe('⛈️');
  });

  it('falls back for codes it does not know', () => {
    expect(weatherIcon(50, false)).toBe('🌤️');
  });

  it('every WMO code and every ?weather= demo shows a real icon, day and night', () => {
    const demos = ['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm', 'wind'] as const;
    const codes = [...Array(100).keys(), ...demos.map((d) => demoConditions(d).code)];
    for (const night of [false, true])
      for (const code of codes) {
        const icon = weatherIcon(code, night);
        // The clear-night moon is a text symbol, the same one the clock shows.
        if (code === 0 && night) expect(icon).toBe('☾');
        // Fog is drawn (FogIcon): Apple's fog emoji 🌫 is a plain blurred grey square.
        else if (code === 45 || code === 48) expect(icon).toBe(FOG);
        else expect(isEmoji(icon), `${code} ${night ? 'night' : 'day'}: ${icon}`).toBe(true);
      }
  });
});
