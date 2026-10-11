import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openAt } from '../places/store';
import { buildNetwork } from '../sim/network';
import { realTripSource, timetableStatus } from '../sim/real';
import { buildDaySchedule } from '../sim/schedule';
import { cachedDays } from '../sim/state';
import type { HolidayFile, TimetableFile } from '../sim/timetable-data';
import { addEvent, addPlace, createPlan, fmtMin, moveStop, nextSlot, removeStop, setStart, sortedStops, type Plan } from './model';
import { decodePlan, encodePlan } from './share';
import { buildTimeline, connect, hhmm, type PlanDeps } from './timeline';

const json = <T>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const tt = json<TimetableFile>('data/timetables.json');
const holidays = json<HolidayFile>('data/catalog/holidays.json');
const lines = json<{ lines: { id: string; stops: string[] }[] }>('data/lines.json').lines;
const net = buildNetwork(lines as never, json('data/routes.geojson'), 41.05);
const real = realTripSource(tt, holidays, (id) => net.inputs.find((i) => i.line.id === id)!.legs);
const getDay = cachedDays((d) => buildDaySchedule(net.inputs, d, undefined, real), 8);
const piers = json<{ features: { properties: { id: string; name: string; nameEn: string }; geometry: { coordinates: [number, number] } }[] }>('data/piers.geojson').features.map((f) => ({ ...f.properties, lngLat: f.geometry.coordinates }));
const pier = (id: string) => piers.find((p) => p.id === id)!.lngLat;
/** A test place ~150 m inland-ish of a real pier (position derived from the pier, not typed). */
const near = (id: string, dx = 0.0012, dy = 0.0006): [number, number] => [pier(id)[0] + dx, pier(id)[1] + dy];

const PLACES: Record<string, { name: string; lngLat: [number, number]; hours?: string | null }> = {
  moda: { name: 'Near Kadıköy', lngLat: near('kadikoy'), hours: null },
  galata: { name: 'Near Karaköy', lngLat: near('karakoy', 0.001, 0.0008), hours: 'Mo-Su 09:00-17:00' },
  bes: { name: 'Near Beşiktaş', lngLat: near('besiktas', 0.001, 0.0008), hours: 'Mo-Su 10:00-02:00' },
  kadikoy2: { name: 'Also Kadıköy', lngLat: near('kadikoy', 0.002, -0.001), hours: 'Mo-Su 08:00-23:00' },
};
const EVENTS: Record<string, { title: string; start: string; place: string }> = {
  concert: { title: 'Concert', start: '2026-10-12T21:00:00+03:00', place: 'galata' },
};
const deps: PlanDeps = {
  place: (id) => PLACES[id],
  event: (id) => EVENTS[id],
  openAt: (h, ms) => openAt(h, ms),
  piers,
  getDay,
  timetableValid: (d) => timetableStatus(tt, d) === 'valid',
};
const lineStops = (id: string) => lines.find((l) => l.id === id)!.stops;
const at = (iso: string) => Date.parse(iso);
const ferry = (from: [number, number], to: [number, number], ready: string) => connect(deps, from, to, at(ready), lineStops);

describe('plan model', () => {
  it('keeps the timeline in time order; places take the next free slot, events their real time', () => {
    let p = createPlan('evening', '2026-10-12');
    p = addPlace(p, 'moda', 'Moda', 'food'); // 18:00–19:30
    p = addPlace(p, 'galata', 'Galata', 'culture'); // 19:45–21:15
    p = addEvent(p, { id: 'concert', title: 'Concert', start: EVENTS.concert.start });
    expect(sortedStops(p).map((s) => [s.ref, fmtMin(s.start), s.dur])).toEqual([
      ['moda', '18:00', 90],
      ['galata', '19:45', 90],
      ['concert', '21:00', 120],
    ]);
    expect(nextSlot(p, 60)).toEqual({ day: '2026-10-12', start: 23 * 60 + 15 });
  });

  it('reorders places (swap times; jump over a fixed-time event); events never move', () => {
    let p = createPlan('evening', '2026-10-12');
    p = addPlace(p, 'moda', 'Moda', 'food');
    p = addPlace(p, 'galata', 'Galata', 'culture');
    const [a, b] = sortedStops(p);
    p = moveStop(p, b.id, -1);
    expect(sortedStops(p).map((s) => s.ref)).toEqual(['galata', 'moda']);
    p = addEvent(p, { id: 'concert', title: 'Concert', start: EVENTS.concert.start });
    const ev = sortedStops(p).find((s) => s.kind === 'event')!;
    expect(moveStop(p, ev.id, -1)).toBe(p);
    p = moveStop(p, a.id, 1); // moda (19:45) moves after the concert
    const order = sortedStops(p);
    expect(order.map((s) => s.ref)).toEqual(['galata', 'concert', 'moda']);
    expect(fmtMin(order[2].start)).toBe('23:15');
    p = removeStop(p, ev.id);
    expect(p.stops).toHaveLength(2);
  });

  it('an event after midnight belongs to the evening before', () => {
    const p = addEvent(createPlan('evening', '2026-10-16'), { id: 'late', title: 'Late set', start: '2026-10-17T00:30:00+03:00' });
    expect([p.stops[0].day, fmtMin(p.stops[0].start)]).toEqual(['2026-10-16', '00:30 (+1)']);
  });
});

describe('plan warnings', () => {
  it('closed at the planned time (known hours only), closes during the visit, hours unknown, overlap', () => {
    let p = createPlan('evening', '2026-10-12');
    p = addPlace(p, 'galata', 'Galata', 'culture'); // 18:00, closes 17:00
    p = addPlace(p, 'moda', 'Moda', 'food'); // no hours
    p = setStart(p, sortedStops(p)[1].id, 18 * 60 + 30); // overlaps galata (until 19:30)
    const [day] = buildTimeline(p, deps, lineStops);
    expect(day.stops[0].warnings).toContainEqual({ kind: 'closed' });
    expect(day.stops[1].warnings).toContainEqual({ kind: 'hoursUnknown' });
    expect(day.stops[1].warnings.some((w) => w.kind === 'overlap')).toBe(true);
    let q = createPlan('day', '2026-10-12');
    q = addPlace(q, 'galata', 'Galata', 'culture');
    q = setStart(q, q.stops[0].id, 16 * 60); // open at 16:00, 90 min → closes 17:00
    expect(buildTimeline(q, deps, lineStops)[0].stops[0].warnings).toEqual([{ kind: 'closed', until: '17:00' }]);
  });

  it('a place or event no longer in the data shows as gone, never crashes', () => {
    let p = createPlan('evening', '2026-10-12');
    p = addPlace(p, 'nope', 'Old café');
    p = addEvent(p, { id: 'gone-event', title: 'Old show', start: '2026-10-12T20:00:00+03:00' });
    const [day] = buildTimeline(p, deps, lineStops);
    expect(day.stops.map((s) => [s.name, s.warnings])).toEqual([
      ['Old café', [{ kind: 'gone' }]],
      ['Old show', [{ kind: 'gone' }]],
    ]);
    expect(day.connections).toEqual([{ mode: 'none' }]);
  });
});

describe('connections between stops', () => {
  it('walks when close (approx.: straight line × 1.3 at 4.5 km/h)', () => {
    const c = ferry(PLACES.moda.lngLat, PLACES.kadikoy2.lngLat, '2026-10-12T19:00:00+03:00');
    expect(c.mode).toBe('walk');
  });

  it('takes the first real ferry after the previous stop (Mon 19:30 Kadıköy → Karaköy: 19:40)', () => {
    const c = ferry(PLACES.moda.lngLat, PLACES.galata.lngLat, '2026-10-12T19:30:00+03:00');
    expect(c.mode).toBe('ferry');
    if (c.mode !== 'ferry') return;
    expect([c.lineId, c.fromPier, c.toPier, hhmm(c.dep), c.real]).toEqual(['kadikoy-karakoy-eminonu', 'kadikoy', 'karakoy', '19:40', true]);
    expect(c.walkToMin).toBeGreaterThan(0);
    expect(c.arr).toBeGreaterThan(c.dep);
  });

  it('after midnight uses the previous service day (Tue 00:10 → 00:30 shuttle)', () => {
    const c = ferry(PLACES.moda.lngLat, PLACES.galata.lngLat, '2026-10-13T00:10:00+03:00');
    expect(c.mode === 'ferry' && hhmm(c.dep)).toBe('00:30');
  });

  it('holidays run the Sunday timetable (Thu 29 Oct: no 06:10 weekday trip)', () => {
    const wd = ferry(PLACES.moda.lngLat, PLACES.galata.lngLat, '2026-10-22T06:00:00+03:00');
    const hol = ferry(PLACES.moda.lngLat, PLACES.galata.lngLat, '2026-10-29T06:00:00+03:00');
    expect(wd.mode === 'ferry' && hhmm(wd.dep)).toBe('06:10');
    expect(hol.mode === 'ferry' && hhmm(hol.dep)).toBe('07:00');
  });

  it('Fri/Sat night trips only on those nights (Sat 03:00 Kadıköy → Beşiktaş: 03:45)', () => {
    const sat = ferry(PLACES.moda.lngLat, PLACES.bes.lngLat, '2026-10-17T03:00:00+03:00');
    expect(sat.mode === 'ferry' && [hhmm(sat.dep), sat.lineId]).toEqual(['03:45', 'kadikoy-besiktas']);
    const tue = ferry(PLACES.moda.lngLat, PLACES.bes.lngLat, '2026-10-13T03:00:00+03:00');
    expect(tue.mode === 'ferry' && hhmm(tue.dep)).not.toBe('03:45');
  });

  it('no transport info when nothing real connects', () => {
    const inland: [number, number] = [pier('kadikoy')[0] + 0.12, pier('kadikoy')[1] + 0.05];
    expect(ferry(PLACES.moda.lngLat, inland, '2026-10-12T12:00:00+03:00')).toEqual({ mode: 'none' });
  });
});

describe('last ferry back', () => {
  const evening = (lateStart: number, dur: number): Plan => {
    let p = createPlan('evening', '2026-10-12');
    p = addPlace(p, 'moda', 'Moda', 'food');
    p = addPlace(p, 'bes', 'Bar', 'food');
    const late = sortedStops(p)[1];
    p = setStart(p, late.id, lateStart);
    return { ...p, stops: p.stops.map((s) => (s.id === late.id ? { ...s, dur } : s)) };
  };
  it('warns when the plan ends after the last real departure back (Beşiktaş → Kadıköy 23:45)', () => {
    const [day] = buildTimeline(evening(22 * 60 + 30, 90), deps, lineStops);
    expect(day.lastFerry).toMatchObject({ toPier: 'kadikoy', missed: true, real: true });
    expect(hhmm(day.lastFerry!.dep)).toBe('23:45');
  });
  it("doesn't warn when the plan ends in time", () => {
    const [day] = buildTimeline(evening(21 * 60, 60), deps, lineStops);
    expect(day.lastFerry).toMatchObject({ missed: false });
  });
  it('on a Friday night the night timetable is the last ferry', () => {
    let p = createPlan('evening', '2026-10-16');
    p = addPlace(p, 'moda', 'Moda', 'food');
    p = addPlace(p, 'bes', 'Bar', 'food');
    const [day] = buildTimeline(p, deps, lineStops);
    expect(hhmm(day.lastFerry!.dep)).toBe('05:30');
  });
});

describe('plan dates outside the timetable', () => {
  it('ferries fall back to the simulated schedule, labelled', () => {
    let p = createPlan('evening', '2027-07-05');
    p = addPlace(p, 'moda', 'Moda', 'food');
    p = addPlace(p, 'galata', 'Galata', 'culture');
    const [day] = buildTimeline(p, deps, lineStops);
    expect(day.simulatedFerries).toBe(true);
    const c = day.connections[0];
    expect(c.mode === 'ferry' && c.real).toBe(false);
  });
});

describe('share links', () => {
  it('round-trips a plan', () => {
    let p = createPlan('days', '2026-10-12', '2026-10-14');
    p = addPlace(p, 'moda', 'Moda', 'food');
    p = addEvent(p, { id: 'concert', title: 'Concert', start: EVENTS.concert.start });
    const link = encodePlan(p)!;
    expect(link.length).toBeLessThan(400);
    const q = decodePlan(link)!;
    expect([q.kind, q.from, q.to]).toEqual(['days', '2026-10-12', '2026-10-14']);
    expect(q.stops.map(({ kind, ref, day, start, dur, label }) => ({ kind, ref, day, start, dur, label }))).toEqual(p.stops.map(({ kind, ref, day, start, dur, label }) => ({ kind, ref, day, start, dur, label })));
  });

  it('stays under the length limit (names shortened / dropped), refuses plans that cannot fit', () => {
    let p = createPlan('day', '2026-10-12');
    for (let i = 0; i < 20; i++) p = addPlace(p, `place-with-a-rather-long-osm-derived-id-${i}-w1234567890`, 'A very long place name that goes on and on and on');
    const link = encodePlan(p);
    expect(link).not.toBeNull();
    expect(('#plan=' + link).length).toBeLessThanOrEqual(2000);
    expect(encodePlan(addPlace(p, 'one-more', 'x'))).toBeNull();
  });

  it('old or broken links give null, never throw', () => {
    for (const bad of ['', 'garbage', '1.', '1.!!!', '2.eyJrIjoiZSJ9', `1.${btoa('{"k":"x","f":"2026-10-12","n":1,"s":[]}')}`, `1.${btoa('{"k":"e","f":"2026-13-45","n":1,"s":[]}')}`, `1.${btoa('{"k":"e","f":"2026-10-12","n":1,"s":[[0,"x",5,60,60]]}')}`, `1.${btoa('not json')}`]) {
      expect(decodePlan(bad)).toBeNull();
    }
  });
});
