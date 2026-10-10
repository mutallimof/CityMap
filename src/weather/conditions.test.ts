import { describe, expect, it } from 'vitest';
import { CALM, chop, demoConditions, easeConditions, fromOpenMeteo, parseDemo, seasonOf } from './conditions';

describe('weather conditions', () => {
  it('maps WMO codes to effects', () => {
    expect(fromOpenMeteo({ weather_code: 63, cloud_cover: 40 }).rain).toBeGreaterThan(0.5);
    expect(fromOpenMeteo({ weather_code: 63, cloud_cover: 40 }).cloud).toBeGreaterThanOrEqual(0.8);
    expect(fromOpenMeteo({ weather_code: 75 }).snow).toBe(1);
    expect(fromOpenMeteo({ weather_code: 45 }).fog).toBeGreaterThan(0.5);
    expect(fromOpenMeteo({ weather_code: 0, visibility: 1000 }).fog).toBeGreaterThan(0.5);
    expect(fromOpenMeteo({ weather_code: 0, cloud_cover: 0 })).toMatchObject({ rain: 0, snow: 0, fog: 0, cloud: 0 });
    expect(fromOpenMeteo({ weather_code: 96 }).thunder).toBe(1);
  });

  it('seasons follow the calendar', () => {
    expect(seasonOf(new Date('2026-04-15T12:00:00Z'))).toBe('spring');
    expect(seasonOf(new Date('2026-07-01T12:00:00Z'))).toBe('summer');
    expect(seasonOf(new Date('2026-10-10T12:00:00Z'))).toBe('autumn');
    expect(seasonOf(new Date('2026-01-10T12:00:00Z'))).toBe('winter');
  });

  it('parses demo switches and ignores junk', () => {
    expect(parseDemo('?weather=rain&season=spring')).toEqual({ weather: 'rain', season: 'spring' });
    expect(parseDemo('?weather=lava')).toEqual({ weather: null, season: null });
  });

  it('eases wind direction along the short arc', () => {
    const a = { ...CALM, windFrom: 350 };
    const b = { ...CALM, windFrom: 10 };
    expect(easeConditions(a, b, 0.5).windFrom).toBeCloseTo(0, 5);
  });

  it('wind preset is choppy, clear is calm', () => {
    expect(chop(demoConditions('wind'))).toBeGreaterThan(0.8);
    expect(chop(demoConditions('clear'))).toBe(0);
  });
});
