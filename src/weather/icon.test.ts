import { describe, expect, it } from 'vitest';
import { weatherIcon } from './icon';

describe('weatherIcon', () => {
  it('maps WMO codes to day / night icons', () => {
    expect(weatherIcon(0, false)).toBe('☀️');
    expect(weatherIcon(0, true)).toBe('☾');
    expect(weatherIcon(2, false)).toBe('⛅');
    expect(weatherIcon(3, true)).toBe('☁️');
    expect(weatherIcon(45, false)).toBe('🌫');
    expect(weatherIcon(61, false)).toBe('🌧');
    expect(weatherIcon(73, true)).toBe('🌨');
    expect(weatherIcon(81, false)).toBe('🌦');
    expect(weatherIcon(95, false)).toBe('⛈');
  });

  it('falls back for codes it does not know', () => {
    expect(weatherIcon(50, false)).toBe('🌤');
  });
});
