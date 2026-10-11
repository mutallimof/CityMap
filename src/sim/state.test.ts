import { describe, expect, it } from 'vitest';
import { buildDaySchedule } from './schedule';
import { cachedDays, findSegment, nextDepartures, vesselStateAt, vesselsAt } from './state';
import { parseHHMM } from './time';
import { MULTI, SHUTTLE } from './fixtures';

const DAY = 20_000;
const getDay = cachedDays((d) => buildDaySchedule([SHUTTLE, MULTI], d));

describe('findSegment', () => {
  const segs = [
    { kind: 'dock', t0: 0, t1: 10, stopIndex: 0, arrive: null, depart: null },
    { kind: 'dock', t0: 10, t1: 20, stopIndex: 0, arrive: null, depart: null },
  ] as const;
  it('binary-searches half-open intervals', () => {
    expect(findSegment([...segs], -1)).toBe(-1);
    expect(findSegment([...segs], 0)).toBe(0);
    expect(findSegment([...segs], 9.99)).toBe(0);
    expect(findSegment([...segs], 10)).toBe(1);
    expect(findSegment([...segs], 20)).toBe(-1);
  });
});

describe('vesselStateAt', () => {
  const v = getDay(DAY).vessels.find((x) => x.lineId === 'w-z')!;

  it('is a pure function of time', () => {
    const t = parseHHMM('12:34') + 0.5;
    expect(vesselStateAt(v, t)).toEqual(vesselStateAt(v, t));
  });

  it('moves smoothly through a whole day: no jumps, stops at rest, docks at rest', () => {
    const dt = 1;
    let prev = null as ReturnType<typeof vesselStateAt>;
    const start = v.segments[0].t0;
    const end = v.segments[v.segments.length - 1].t1;
    for (let t = start; t < end; t += dt) {
      const s = vesselStateAt(v, t)!;
      expect(s).not.toBeNull();
      if (s.phase === 'docked') expect(s.speed).toBe(0);
      if (prev) {
        // Speed never jumps (ramps are at most peak·π/(2·60) m/s² ≈ 0.18 m/s²).
        expect(Math.abs(s.speed - prev.speed)).toBeLessThan(0.2 * dt);
        if (prev.phase === 'underway' && s.phase === 'underway' && prev.legIndex === s.legIndex) {
          expect(s.distance).toBeGreaterThanOrEqual(prev.distance);
        }
        // Leaving a dock: starts at distance ~0. Arriving: ends at the leg's length.
        if (prev.phase === 'docked' && s.phase === 'underway') expect(s.distance).toBeLessThan(0.01);
        if (prev.phase === 'underway' && s.phase === 'docked') expect(prev.legLength - prev.distance).toBeLessThan(0.05);
      }
      prev = s;
    }
    expect(vesselStateAt(v, end)).toBeNull();
    expect(vesselStateAt(v, start - 1)).toBeNull();
  });

  it('reports next stop, ETA and trip progress', () => {
    const leg = v.segments.find((s) => s.kind === 'leg' && s.dir === 'out' && s.legIndex === 1)!;
    const s = vesselStateAt(v, (leg.t0 + leg.t1) / 2)!;
    expect(s.nextStopIndex).toBe(2);
    expect(s.eta).toBeCloseTo((leg.t1 - leg.t0) / 2);
    expect(s.tripProgress).toBeGreaterThan(0);
    expect(s.tripProgress).toBeLessThan(1);
  });
});

describe('vesselsAt', () => {
  it('has no vessels in the small hours, many at midday', () => {
    expect(vesselsAt(getDay, { day: DAY, seconds: parseHHMM('04:00') })).toHaveLength(0);
    expect(vesselsAt(getDay, { day: DAY, seconds: parseHHMM('12:00') }).length).toBeGreaterThan(2);
  });

  it("includes yesterday's late trips after midnight", () => {
    const after = vesselsAt(getDay, { day: DAY, seconds: parseHHMM('00:40') });
    expect(after.some((s) => s.lineId === 'w-z')).toBe(true);
    expect(after.every((s) => s.lineId === 'w-z')).toBe(true);
  });

  it('peak hours run more vessels than late evening', () => {
    const peak = vesselsAt(getDay, { day: DAY, seconds: parseHHMM('08:30') }).filter((s) => s.lineId === 'a-b');
    const late = vesselsAt(getDay, { day: DAY, seconds: parseHHMM('22:30') }).filter((s) => s.lineId === 'a-b');
    expect(peak.length).toBeGreaterThan(late.length);
  });
});

describe('nextDepartures', () => {
  it('returns the next n departures from a stop in time order', () => {
    const at = { day: DAY, seconds: parseHHMM('07:01') };
    const deps = nextDepartures(getDay, 'a', at, 5);
    expect(deps).toHaveLength(5);
    expect(deps[0].inSeconds).toBe(parseHHMM('07:15') - parseHHMM('07:01'));
    for (let i = 1; i < deps.length; i++) expect(deps[i].inSeconds).toBeGreaterThanOrEqual(deps[i - 1].inSeconds);
  });

  it('crosses midnight into the next service day', () => {
    const deps = nextDepartures(getDay, 'a', { day: DAY, seconds: parseHHMM('23:50') }, 2);
    expect(deps[0].inSeconds).toBeGreaterThan(0);
    expect(deps.length).toBe(2);
  });
});
