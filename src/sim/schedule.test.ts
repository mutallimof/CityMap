import { describe, expect, it } from 'vitest';
import { buildDaySchedule, buildLineDay, DEFAULT_PARAMS } from './schedule';
import { originDepartures } from './timetable';
import { MULTI, SHUTTLE } from './fixtures';
import type { Segment } from './types';

const DAY = 20_000;

describe.each([SHUTTLE, MULTI])('buildLineDay($line.id)', (input) => {
  const { vessels, departures } = buildLineDay(input, DAY);
  const n = input.line.stops.length;
  const dwell = input.line.service.dwellMin * 60;

  it('gives every vessel contiguous segments, starting and ending docked at the origin', () => {
    for (const v of vessels) {
      expect(v.segments[0]).toMatchObject({ kind: 'dock', stopIndex: 0 });
      expect(v.segments[v.segments.length - 1]).toMatchObject({ kind: 'dock', stopIndex: 0 });
      for (let i = 1; i < v.segments.length; i++) expect(v.segments[i].t0).toBeCloseTo(v.segments[i - 1].t1, 9);
      for (const s of v.segments) expect(s.t1).toBeGreaterThan(s.t0);
    }
  });

  it('runs every timetabled origin departure exactly once', () => {
    const origin = departures.filter((d) => d.direction === 'out' && d.stopId === input.line.stops[0]).map((d) => d.t);
    expect(origin).toEqual(originDepartures(input.line.service, DEFAULT_PARAMS.peakWindows));
  });

  it('alternates legs and docks, never two legs in a row (always stops at piers)', () => {
    for (const v of vessels) {
      for (let i = 1; i < v.segments.length; i++) {
        expect(v.segments[i].kind === 'leg' && v.segments[i - 1].kind === 'leg').toBe(false);
      }
    }
  });

  it('legs connect adjacent stops in order and docks last ≥ one dwell', () => {
    for (const v of vessels) {
      let at = 0;
      for (const s of v.segments) {
        if (s.kind === 'dock') {
          expect(s.stopIndex).toBe(at);
          expect(s.t1 - s.t0).toBeGreaterThanOrEqual(dwell - 1e-9);
        } else {
          const from = s.direction === 'out' ? s.legIndex : s.legIndex + 1;
          const to = s.direction === 'out' ? s.legIndex + 1 : s.legIndex;
          expect(from).toBe(at);
          at = to;
          expect(to).toBeGreaterThanOrEqual(0);
          expect(to).toBeLessThan(n);
        }
      }
    }
  });

  it('never leaves a vessel idling longer than maxLayover between trips', () => {
    for (const v of vessels) {
      for (const s of v.segments.slice(1, -1)) {
        if (s.kind === 'dock') expect(s.t1 - s.t0).toBeLessThanOrEqual(DEFAULT_PARAMS.maxLayoverS);
      }
    }
  });

  it('reuses vessels instead of spawning one per departure', () => {
    const trips = originDepartures(input.line.service, DEFAULT_PARAMS.peakWindows).length;
    expect(vessels.length).toBeLessThan(trips / 2);
    expect(vessels.length).toBeGreaterThan(0);
  });

  it('lists a departure from every stop except the last, in both directions', () => {
    const trip = departures.filter((d) => d.tripId.endsWith(':0:out'));
    expect(trip.map((d) => d.stopId)).toEqual(input.line.stops.slice(0, -1));
    const back = departures.filter((d) => d.tripId.endsWith(':0:back'));
    expect(back.map((d) => d.stopId)).toEqual([...input.line.stops].reverse().slice(0, -1));
  });
});

describe('buildDaySchedule', () => {
  it('rejects geometry that does not match the stop count', () => {
    expect(() => buildLineDay({ ...SHUTTLE, geometry: { legLengths: [1, 2] } }, DAY)).toThrow();
  });

  it('merges lines with departures sorted by time', () => {
    const s = buildDaySchedule([SHUTTLE, MULTI], DAY);
    expect(new Set(s.vessels.map((v) => v.lineId))).toEqual(new Set(['a-b', 'w-z']));
    for (let i = 1; i < s.departures.length; i++) expect(s.departures[i].t).toBeGreaterThanOrEqual(s.departures[i - 1].t);
  });

  it('is deterministic', () => {
    const strip = (x: Segment[]) => JSON.stringify(x);
    const a = buildDaySchedule([MULTI], DAY);
    const b = buildDaySchedule([MULTI], DAY);
    expect(a.vessels.map((v) => strip(v.segments))).toEqual(b.vessels.map((v) => strip(v.segments)));
  });
});
