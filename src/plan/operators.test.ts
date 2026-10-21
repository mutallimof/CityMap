/**
 * The planner with the private operators' lines (Turyol, Dentur Avrasya) on the whole network: ferry legs use
 * them when their timetable is real, with the same rules (piers within walking distance, published departures
 * only); dates the operator's timetable doesn't cover give the labelled simulated schedule.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { timetableFiles } from '../sim/test-files';
import { openAt } from '../places/store';
import { buildNetwork } from '../sim/network';
import { realTripSource, timetableStatus } from '../sim/real';
import { buildDaySchedule } from '../sim/schedule';
import { cachedDays } from '../sim/state';
import type { HolidayFile } from '../sim/timetable-data';
import type { LineSpec } from '../sim/types';
import { makeLandIndex } from './land';
import { connect, hhmm, type PlanDeps } from './timeline';

const json = <T>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const files = timetableFiles(); // operator read windows pinned (test-files.ts)
const dentur = files[2];
const holidays = json<HolidayFile>('data/catalog/holidays.json');
const lines = json<{ lines: LineSpec[] }>('data/lines.json').lines;
const net = buildNetwork(lines, json('data/routes.geojson'), 41.05);
const real = realTripSource(files, holidays, (id) => net.inputs.find((i) => i.line.id === id)!.legs);
const getDay = cachedDays((d) => buildDaySchedule(net.inputs, d, undefined, real), 8);
const piers = json<{ features: { properties: { id: string; name: string; nameEn: string; operator?: string }; geometry: { coordinates: [number, number] } }[] }>('data/piers.geojson').features.map((f) => ({ ...f.properties, lngLat: f.geometry.coordinates }));
const land = makeLandIndex(json('data/land.geojson'));
const deps: PlanDeps = {
  place: () => undefined,
  event: () => undefined,
  openAt: (h, ms) => openAt(h, ms),
  piers,
  getDay,
  timetableValid: (d) => timetableStatus(files[0], d) === 'valid',
  landOf: (p, snapM) => land.landOf(p, snapM),
};
const lineStops = (id: string) => lines.find((l) => l.id === id)!.stops;
const pier = (id: string) => piers.find((p) => p.id === id)!.lngLat;
/** A test point ~100 m inland of a real pier (derived from the pier, not typed). */
const near = (id: string, dx: number, dy: number): [number, number] => [pier(id)[0] + dx, pier(id)[1] + dy];
const at = (iso: string) => Date.parse(iso);
const UskudarSquare = near('uskudar-dentur', 0.0012, -0.0006);
const KabatasShore = near('kabatas-dentur', 0.0006, -0.0009);
const printed = (pierId: string, day: 'weekday' | 'sunday') =>
  dentur.lines['dentur-uskudar-kabatas'].trips.filter((t) => t.calls[0].stop === pierId && t.days.includes(day)).map((t) => t.calls[0].dep!);

describe('planner ferry legs on the private operators’ lines', () => {
  it('Üsküdar → Kabataş on a weekday: the Dentur Avrasya boat, at a printed departure time', () => {
    const c = connect(deps, UskudarSquare, KabatasShore, at('2026-10-19T10:02:00+03:00'), lineStops);
    expect(c.mode).toBe('ferry');
    if (c.mode !== 'ferry') return;
    expect([c.lineId, c.fromPier, c.toPier, c.real]).toEqual(['dentur-uskudar-kabatas', 'uskudar-dentur', 'kabatas-dentur', true]);
    expect(printed('uskudar-dentur', 'weekday')).toContain(hhmm(c.dep));
    expect(c.dep).toBeGreaterThanOrEqual(at('2026-10-19T10:02:00+03:00') + c.walkToMin * 60_000);
    expect(c.arr).toBeGreaterThan(c.dep);
  });

  it('on a public holiday the source prints nothing: the leg is labelled simulated (never shown as real)', () => {
    const c = connect(deps, UskudarSquare, KabatasShore, at('2026-10-29T10:02:00+03:00'), lineStops);
    expect(c.mode === 'ferry' && [c.lineId, c.real]).toEqual(['dentur-uskudar-kabatas', false]);
  });

  it('after the last good read has run out: simulated, labelled', () => {
    const c = connect(deps, UskudarSquare, KabatasShore, at('2026-12-07T10:02:00+03:00'), lineStops);
    expect(c.mode).toBe('ferry');
    if (c.mode === 'ferry') expect(c.real).toBe(false);
  });

  it('a Turyol sailing printed to two destinations: board at its origin only (no ride between the two destinations is made up)', () => {
    const d = getDay(Date.parse('2026-10-19T00:00:00Z') / 86_400_000);
    const trip = d.vessels.flatMap((v) => v.segments).find((s) => s.kind === 'leg' && s.trip.id.startsWith('turyol-kadikoy-karakoy-eminonu:kadikoy-yeni-turyol>karakoy-turyol+eminonu-turyol:'));
    expect(trip).toBeTruthy();
    const deps = d.departures.filter((x) => x.tripId === (trip as { trip: { id: string } }).trip.id);
    expect(deps.map((x) => x.stopId)).toEqual(['kadikoy-yeni-turyol']);
  });
});
