import { describe, expect, it } from 'vitest';
import { fleetAt } from './fleet';
import { linePath } from './path';
import { buildDaySchedule } from './schedule';
import { cachedDays } from './state';
import { parseHHMM } from './time';
import { MULTI } from './fixtures';

// Geometry matching MULTI's stops w-x-y-z: three legs heading north/east/north.
const path = linePath('w-z', [[29, 41], [29, 41.0226], [29.006, 41.0226], [29.006, 41.0597]], [0, 1, 2, 3], 41);
const input = { ...MULTI, geometry: { legLengths: path.legs.map((l) => l.length) } };
const getDay = cachedDays((d) => buildDaySchedule([input], d));
const paths = new Map([['w-z', path]]);
const DAY = 20_000;

describe('fleetAt', () => {
  it('positions never jump over a whole service day (1 s steps)', () => {
    const maxStep = (26 / 3.6) * 1.01; // cruise speed + 1%
    let prev = new Map<string, [number, number]>();
    for (let t = parseHHMM('09:50'); t < 86_400 + parseHHMM('03:00'); t += 1) {
      const day = t >= 86_400 ? DAY + 1 : DAY;
      const fleet = fleetAt(getDay, paths, { day, seconds: t % 86_400 });
      const next = new Map<string, [number, number]>();
      for (const v of fleet) {
        const p = prev.get(v.state.vesselId);
        if (p) {
          const dx = (v.lngLat[0] - p[0]) * 84_000;
          const dy = (v.lngLat[1] - p[1]) * 110_574;
          expect(Math.hypot(dx, dy)).toBeLessThan(maxStep);
        }
        next.set(v.state.vesselId, v.lngLat);
      }
      prev = next;
    }
  });

  it('docked vessels sit exactly on their stop vertex', () => {
    const fleet = fleetAt(getDay, paths, { day: DAY, seconds: parseHHMM('12:00') });
    for (const v of fleet.filter((f) => f.state.phase === 'docked')) {
      const stop = [[29, 41], [29, 41.0226], [29.006, 41.0226], [29.006, 41.0597]][v.state.stopIndex!];
      expect(v.lngLat[0]).toBeCloseTo(stop[0], 9);
      expect(v.lngLat[1]).toBeCloseTo(stop[1], 9);
    }
  });
});
