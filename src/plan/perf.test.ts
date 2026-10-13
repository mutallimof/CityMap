/**
 * Guard against a suspected freeze: plans with a stop near Kadıköy and one across the water (a ferry
 * leg between them), on real-timetable days, Fri/Sat nights, a holiday and simulated-schedule days,
 * with start / end points and several days. Every timeline must build quickly, schedules included.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openAt } from '../places/store';
import { buildNetwork } from '../sim/network';
import { realTripSource, timetableStatus } from '../sim/real';
import { buildDaySchedule } from '../sim/schedule';
import { cachedDays } from '../sim/state';
import type { HolidayFile, TimetableFile } from '../sim/timetable-data';
import { addDays, addPlace, createPlan, type Plan, type PlanKind } from './model';
import { decodePlan, encodePlan } from './share';
import { makeLandIndex } from './land';
import { buildTimeline, type PlanDeps } from './timeline';

const json = <T>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const land = makeLandIndex(json('data/land.geojson'));
const tt = json<TimetableFile>('data/timetables.json');
const holidays = json<HolidayFile>('data/catalog/holidays.json');
// Şehir Hatları lines only: these tests pin that network's behaviour; the private operators' lines are tested in src/sim/operators.test.ts.
const lines = json<{ lines: { id: string; stops: string[]; operator?: string }[] }>('data/lines.json').lines.filter((l) => !l.operator);
const net = buildNetwork(lines as never, json('data/routes.geojson'), 41.05);
const real = realTripSource(tt, holidays, (id) => net.inputs.find((i) => i.line.id === id)!.legs);
// Same cache size as the app.
const getDay = cachedDays((d) => buildDaySchedule(net.inputs, d, undefined, real), 8);
const piers = json<{ features: { properties: { id: string; name: string; nameEn: string }; geometry: { coordinates: [number, number] } }[] }>('data/piers.geojson').features.map((f) => ({ ...f.properties, lngLat: f.geometry.coordinates }));
const pier = (id: string) => piers.find((p) => p.id === id)!.lngLat;
/**
 * A test place next to every real pier (position derived from the pier, not typed); at the pier itself
 * where that offset is out on the water (Büyükada's pier head: on no landmass, rightly connected to nothing).
 */
const nextTo = (p: [number, number]): [number, number] => [p[0] + 0.001, p[1] + 0.0006];
const PLACES = new Map(piers.map((p) => [p.id, { name: p.name, lngLat: land.landOf(nextTo(p.lngLat)) === null ? p.lngLat : nextTo(p.lngLat), hours: 'Mo-Su 09:00-22:00' }]));
const deps: PlanDeps = {
  place: (id) => PLACES.get(id),
  event: () => undefined,
  openAt: (h, ms) => openAt(h, ms),
  piers,
  getDay,
  timetableValid: (d) => timetableStatus(tt, d) === 'valid',
  landOf: (p, snapM) => land.landOf(p, snapM),
};
const lineStops = (id: string) => lines.find((l) => l.id === id)!.stops;

describe('plan timing guard (Kadıköy ↔ across the water)', () => {
  it('every plan builds in well under a frame budget per day', () => {
    // (Üsküdar is on Kadıköy's side with no direct line between them: 'no transport info' there is right.)
    // Weekday, Saturday (night trips), Republic Day (holiday), and outside the timetable (simulated).
    const dates = ['2026-10-12', '2026-10-17', '2026-10-29', '2027-07-15'];
    const across = ['karakoy', 'eminonu', 'besiktas', 'kabatas', 'buyukada'].filter((id) => PLACES.has(id));
    expect(across.length).toBe(5);
    let worst = 0;
    const t0 = performance.now();
    for (const date of dates)
      for (const kind of ['evening', 'day', 'days'] as PlanKind[])
        for (const other of across) {
          let p: Plan = createPlan(kind, date, kind === 'days' ? addDays(date, 3) : date);
          p = { ...p, ends: { start: { name: 'Hotel', ll: pier(other) } } };
          for (const ref of ['kadikoy', other, 'kadikoy', other]) p = addPlace(p, ref, ref);
          const s = performance.now();
          const days = buildTimeline(p, deps, lineStops);
          // The shared link round-trips and builds the same.
          const back = decodePlan(encodePlan(p, { ends: true })!);
          buildTimeline(back!, deps, lineStops);
          worst = Math.max(worst, performance.now() - s);
          expect([date, kind, other, days.some((d) => d.connections.some((c) => c.mode === "ferry"))]).toEqual([date, kind, other, true]);
        }
    // A cold schedule build is ~5 ms here; a timeline is a few ms. A freeze would be seconds.
    expect(worst).toBeLessThan(1500);
    expect(performance.now() - t0).toBeLessThan(15_000);
  });
});
