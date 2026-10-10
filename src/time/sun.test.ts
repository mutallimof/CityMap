import { describe, expect, it } from 'vitest';
import { sunPosition, sunTimes } from './sun';

const IST = { lat: 41.02, lon: 29.0 };
const istanbul = (y: number, m: number, d: number, hh: number, mm = 0) => Date.UTC(y, m - 1, d, hh - 3, mm);

describe('sun', () => {
  it('Istanbul sunset on 10 Oct is around 18:40 local, sunrise around 07:10', () => {
    const t = sunTimes(istanbul(2026, 10, 10, 12), IST.lat, IST.lon)!;
    const local = (ms: number) => new Date(ms + 3 * 3_600_000).getUTCHours() * 60 + new Date(ms + 3 * 3_600_000).getUTCMinutes();
    expect(local(t.sunset)).toBeGreaterThan(18 * 60 + 25);
    expect(local(t.sunset)).toBeLessThan(18 * 60 + 55);
    expect(local(t.sunrise)).toBeGreaterThan(6 * 60 + 55);
    expect(local(t.sunrise)).toBeLessThan(7 * 60 + 25);
  });

  it('elevation crosses zero near sunset and is ~49° at equinox noon', () => {
    const t = sunTimes(istanbul(2026, 10, 10, 12), IST.lat, IST.lon)!;
    expect(Math.abs(sunPosition(t.sunset, IST.lat, IST.lon).elevation)).toBeLessThan(1.5);
    const eq = sunTimes(istanbul(2026, 3, 20, 12), IST.lat, IST.lon)!;
    expect(sunPosition(eq.noon, IST.lat, IST.lon).elevation).toBeCloseTo(90 - IST.lat, 0);
  });

  it('sun is in the south at noon, west at sunset, below horizon at midnight', () => {
    const t = sunTimes(istanbul(2026, 6, 21, 12), IST.lat, IST.lon)!;
    expect(sunPosition(t.noon, IST.lat, IST.lon).azimuth).toBeCloseTo(180, -1);
    const set = sunPosition(t.sunset, IST.lat, IST.lon).azimuth;
    expect(set).toBeGreaterThan(290);
    expect(set).toBeLessThan(310);
    expect(sunPosition(istanbul(2026, 6, 21, 0), IST.lat, IST.lon).elevation).toBeLessThan(-15);
  });
});
