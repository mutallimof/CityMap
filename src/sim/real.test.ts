import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fleetAt } from './fleet';
import { buildNetwork } from './network';
import { dayTypeOf, expiryWarning, isoDate, isoWeekday, realTripSource, timetableStatus } from './real';
import { buildDaySchedule, buildTrip } from './schedule';
import { cachedDays, nextDepartures } from './state';
import { clockToSeconds, type HolidayFile, type TimetableFile } from './timetable-data';
import { parseHHMM } from './time';
import { ROUND } from './fixtures';

const json = <T>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const tt = json<TimetableFile>('data/timetables.json');
const holidays = json<HolidayFile>('data/catalog/holidays.json');
const net = buildNetwork(json<{ lines: never[] }>('data/lines.json').lines, json('data/routes.geojson'), 41.05);
const legsOf = (id: string) => net.inputs.find((i) => i.line.id === id)!.legs;
const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
const MON = dayOf('2026-10-12');

function schedules(file: TimetableFile | null = tt) {
  const real = realTripSource(file, holidays, legsOf);
  return cachedDays((d) => buildDaySchedule(net.inputs, d, undefined, real));
}

describe('service days and holidays', () => {
  it('knows weekdays and ISO dates', () => {
    expect(isoDate(MON)).toBe('2026-10-12');
    expect(isoWeekday(MON)).toBe(1);
    expect(isoWeekday(dayOf('2026-10-18'))).toBe(7);
  });

  it('runs the Sunday timetable on public holidays (incl. moving religious ones)', () => {
    expect(dayTypeOf(MON, holidays)).toBe('weekday');
    expect(dayTypeOf(dayOf('2026-10-17'), holidays)).toBe('saturday');
    expect(dayTypeOf(dayOf('2026-10-29'), holidays)).toBe('sunday'); // Cumhuriyet Bayramı (Thursday)
    expect(dayTypeOf(dayOf('2027-03-09'), holidays)).toBe('sunday'); // Ramazan Bayramı
    expect(dayTypeOf(dayOf('2027-05-17'), holidays)).toBe('sunday'); // Kurban Bayramı
    expect(dayTypeOf(dayOf('2027-03-08'), holidays)).toBe('weekday'); // arife: half day, normal timetable
  });
});

describe('real timetable on the map', () => {
  const getDay = schedules();

  it('runs every line on its real timetable inside the validity period', () => {
    expect(Object.values(getDay(MON).modes)).toEqual(['real', 'real', 'real', 'real', 'real', 'real', 'real']);
  });

  it('pier boards show printed times exactly (Kadıköy, Monday morning)', () => {
    const deps = nextDepartures(getDay, 'kadikoy', { day: MON, seconds: parseHHMM('06:00') }, 6);
    expect(deps.map((d) => [d.lineId, (d.t / 60) | 0])).toEqual([
      ['kadikoy-karakoy-eminonu', 6 * 60 + 10],
      ['kadikoy-karakoy-eminonu', 6 * 60 + 30],
      ['kadikoy-karakoy-eminonu', 6 * 60 + 45],
      ['kadikoy-besiktas', 6 * 60 + 45],
      ['kadikoy-karakoy-eminonu', 7 * 60],
      ['adalar', 7 * 60 + 10],
    ]);
    expect(deps.every((d) => d.real)).toBe(true);
  });

  it('weekday-only trips skip Saturdays; Saturday-only-not-Sunday trips skip Sundays and holidays', () => {
    const first = (day: number) => nextDepartures(getDay, 'kadikoy', { day, seconds: parseHHMM('05:00') }, 1)[0];
    expect((first(dayOf('2026-10-17')).t / 60) | 0).toBe(6 * 60 + 30); // Saturday: no 06:10*
    expect((first(dayOf('2026-10-18')).t / 60) | 0).toBe(7 * 60); // Sunday: Adalar Sunday table starts 07:55, line 07:00
    expect((first(dayOf('2026-10-29')).t / 60) | 0).toBe(7 * 60); // holiday = Sunday
  });

  it('no boarding at Karaköy for the *** call — the vessel still calls there', () => {
    const at = { day: MON, seconds: parseHHMM('20:40') };
    const deps = nextDepartures(getDay, 'karakoy', at, 3).filter((d) => d.lineId === 'kadikoy-karakoy-eminonu');
    expect(deps.map((d) => (d.t / 60) | 0)).not.toContain(20 * 60 + 55);
    const v = getDay(MON).vessels.find((x) => x.segments.some((s) => s.kind === 'dock' && s.trip?.id === 'kadikoy-karakoy-eminonu:44:out'));
    expect(v).toBeDefined();
  });

  it('Friday/Saturday night trips belong to the evening service day and run only then', () => {
    const fri = dayOf('2026-10-16');
    const night = (day: number) => getDay(day).departures.filter((d) => d.tripId.startsWith('kadikoy-karakoy-besiktas-night'));
    expect(night(MON)).toHaveLength(0);
    expect(night(dayOf('2026-10-18'))).toHaveLength(0); // Sunday evening: no night service
    expect(night(fri).length).toBe(20);
    // 03:00 on Saturday morning: the next Kadıköy departure is Friday's 03:45 (new pier).
    const d = nextDepartures(getDay, 'kadikoy', { day: fri + 1, seconds: parseHHMM('03:00') }, 1)[0];
    expect([d.tripId.startsWith('kadikoy-karakoy-besiktas-night'), d.inSeconds, d.pier]).toEqual([true, 45 * 60, 'new']);
  });

  it('every printed departure is sailed: a vessel leaves that pier at that exact second', () => {
    for (const day of [MON, dayOf('2026-10-16'), dayOf('2026-10-18')]) {
      const s = getDay(day);
      const leaving = new Set<string>();
      for (const v of s.vessels) {
        v.segments.forEach((seg, i) => {
          const next = v.segments[i + 1];
          if (seg.kind === 'dock' && next?.kind === 'leg') leaving.add(`${net.inputs.find((x) => x.line.id === v.lineId)!.line.stops[seg.stopIndex]}@${next.t0}`);
        });
      }
      for (const d of s.departures) expect(leaving.has(`${d.stopId}@${d.t}`), `${d.tripId} ${d.stopId} ${d.t}`).toBe(true);
    }
  });

  it('new Bosphorus piers have boards with printed times (Beykoz, Büyükdere, İstinye, Paşabahçe, Çubuklu)', () => {
    const at = { day: MON, seconds: parseHHMM('06:00') };
    const first = (pier: string) => {
      const d = nextDepartures(getDay, pier, at, 1)[0];
      return [d.lineId, (d.t / 60) | 0, d.real];
    };
    expect(first('beykoz')).toEqual(['anadolu-kavagi-uskudar', 7 * 60, true]);
    expect(first('pasabahce')).toEqual(['anadolu-kavagi-uskudar', 7 * 60 + 10, true]);
    expect(first('cubuklu')).toEqual(['anadolu-kavagi-uskudar', 7 * 60 + 20, true]);
    expect(first('buyukdere')).toEqual(['rumeli-kavagi-eminonu', 7 * 60 + 35, true]);
    expect(first('istinye')).toEqual(['rumeli-kavagi-eminonu', 8 * 60, true]);
    // A trip ending at Sarıyer lists no departure there; Bebek is skipped where the PDF prints "-".
    const bebek = getDay(MON).departures.filter((d) => d.stopId === 'bebek' && d.lineId === 'rumeli-kavagi-eminonu').map((d) => (d.t / 60) | 0);
    expect(bebek).not.toContain(18 * 60 + 15);
  });

  it('printed arrivals are met exactly (Uzun Boğaz Turu at Anadolu Kavağı 12:25; it waits there until 15:00)', () => {
    const v = getDay(MON).vessels.find((x) => x.lineId === 'bogaz')!;
    const legs = v.segments.filter((s) => s.kind === 'leg');
    const arrive = legs.find((s) => s.kind === 'leg' && s.trip.id === 'uzun-bogaz-out:1' && s.toStop === 6)!;
    expect(arrive.t1).toBe(parseHHMM('12:25'));
    const wait = v.segments.find((s) => s.kind === 'dock' && s.stopIndex === 6 && s.t0 === arrive.t1)!;
    expect(wait.t1).toBe(parseHHMM('15:00'));
  });

  it('fleet positions never jump and headings never snap over a real day (1 s steps)', () => {
    const DOCK = { turnSeconds: 50, berthBlendM: 350 };
    const maxStep = (34 / 3.6) * 1.02;
    let prev = new Map<string, { p: [number, number]; b: number }>();
    for (let t = parseHHMM('05:30'); t < 86_400 + parseHHMM('02:00'); t += 1) {
      const at = { day: t >= 86_400 ? MON + 1 : MON, seconds: t % 86_400 };
      const next = new Map<string, { p: [number, number]; b: number }>();
      for (const v of fleetAt(getDay, net.paths, at, DOCK)) {
        const q = prev.get(v.state.vesselId);
        if (q) {
          const dx = (v.lngLat[0] - q.p[0]) * 84_000;
          const dy = (v.lngLat[1] - q.p[1]) * 110_574;
          if (Math.hypot(dx, dy) >= maxStep) expect.fail(`${v.state.vesselId} jumped ${Math.hypot(dx, dy).toFixed(1)} m at ${t}`);
          if (Math.abs(((v.bearing - q.b + 540) % 360) - 180) >= 15) expect.fail(`${v.state.vesselId} heading snapped at ${t}`);
        }
        next.set(v.state.vesselId, { p: v.lngLat, b: v.bearing });
      }
      prev = next;
    }
  }, 60_000);
});

describe('fallback to the simulated schedule', () => {
  it('after the validity date every line is simulated — expired times are never shown as real', () => {
    const getDay = schedules();
    const after = dayOf('2027-06-28');
    expect(timetableStatus(tt, after)).toBe('expired');
    expect(Object.values(getDay(after).modes).every((m) => m === 'sim')).toBe(true);
    expect(getDay(after).departures.every((d) => !d.real)).toBe(true);
    expect(Object.values(getDay(dayOf('2027-06-27')).modes).every((m) => m === 'real')).toBe(true);
    expect(Object.values(getDay(dayOf('2026-09-06')).modes).every((m) => m === 'sim')).toBe(true);
  });

  it('an empty or missing file simulates everything', () => {
    for (const f of [null, { ...tt, lines: {} }]) {
      expect(Object.values(schedules(f)(MON).modes).every((m) => m === 'sim')).toBe(true);
    }
  });

  it('a line whose trips cannot be sailed falls back alone', () => {
    const broken: TimetableFile = { ...tt, lines: { ...tt.lines, bogaz: { ...tt.lines.bogaz, trips: [{ id: 'x', days: ['weekday'], calls: [{ stop: 'eminonu', dep: '10:00' }, { stop: 'bostanci' }] }] } } };
    const problems: string[] = [];
    const getDay = cachedDays((d) => buildDaySchedule(net.inputs, d, undefined, realTripSource(broken, holidays, legsOf, (m) => problems.push(m))));
    expect(getDay(MON).modes.bogaz).toBe('sim');
    expect(getDay(MON).modes.adalar).toBe('real');
    expect(problems[0]).toMatch(/not on bogaz/);
  });

  it('warns (console only) within 30 days of the end date', () => {
    expect(expiryWarning(tt, MON)).toBeNull();
    expect(expiryWarning(tt, dayOf('2027-06-10'))).toMatch(/17 days left/);
    expect(expiryWarning(tt, dayOf('2027-07-01'))).toBeNull();
  });
});

describe('buildTrip with printed times', () => {
  it('keeps printed departures, stops one dwell before them, fits a plausible cruise speed', () => {
    const b = buildTrip(ROUND, { id: 'r', real: true, calls: [{ stop: 0, dep: parseHHMM('07:00') }, { stop: 1, dep: parseHHMM('07:20') }, { stop: 2, atPier: parseHHMM('07:30') }] });
    const [leg1, dock, leg2] = b.segments;
    expect(leg1).toMatchObject({ kind: 'leg', t0: parseHHMM('07:00') });
    expect(dock).toMatchObject({ kind: 'dock', stopIndex: 1, t1: parseHHMM('07:20') });
    expect(dock.t1 - dock.t0).toBe(4 * 60);
    expect(leg2.t0).toBe(parseHHMM('07:20'));
    expect(leg2.t1).toBeLessThanOrEqual(parseHHMM('07:30'));
    if (leg1.kind === 'leg') expect(leg1.cruise * 3.6).toBeGreaterThan(15);
    expect(b.departures.map((d) => d.t)).toEqual([parseHHMM('07:00'), parseHHMM('07:20')]);
  });

  it('uses the direct leg back (E → K) when the trip skips the middle pier', () => {
    const b = buildTrip(ROUND, { id: 'r', real: true, calls: [{ stop: 2, dep: parseHHMM('07:30') }, { stop: 0 }] });
    expect(b.segments).toHaveLength(1);
    expect(b.segments[0]).toMatchObject({ kind: 'leg', legIndex: 2, dir: 'out', fromStop: 2, toStop: 0 });
    expect(clockToSeconds('25:00')).toBe(90_000);
  });
});
