import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openAt } from '../places/store';
import { buildNetwork } from '../sim/network';
import { realTripSource, timetableStatus } from '../sim/real';
import { buildDaySchedule } from '../sim/schedule';
import { cachedDays } from '../sim/state';
import type { HolidayFile, TimetableFile } from '../sim/timetable-data';
import { addPlace, createPlan, setEnds } from './model';
import { isIslet, makeIsletCheck } from './islets';
import { buildTimeline, type PlanDeps } from './timeline';

const json = <T>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const tt = json<TimetableFile>('data/timetables.json');
const holidays = json<HolidayFile>('data/catalog/holidays.json');
const lines = json<{ lines: { id: string; stops: string[] }[] }>('data/lines.json').lines;
const net = buildNetwork(lines as never, json('data/routes.geojson'), 41.05);
const real = realTripSource(tt, holidays, (id) => net.inputs.find((i) => i.line.id === id)!.legs);
const getDay = cachedDays((d) => buildDaySchedule(net.inputs, d, undefined, real), 8);
const piers = json<{ features: { properties: { id: string; name: string; nameEn: string }; geometry: { coordinates: [number, number] } }[] }>('data/piers.geojson').features.map((f) => ({ ...f.properties, lngLat: f.geometry.coordinates }));
const lineStops = (id: string) => lines.find((l) => l.id === id)!.stops;

// Real featured places (coordinates from the shipped OSM-derived data).
type Feat = { properties: { id: string; name: string; nameEn: string | null; osm: string; hours: string | null }; geometry: { coordinates: [number, number] } };
const featured = json<{ features: Feat[] }>('data/places.geojson').features;
const auto = json<{ features: Feat[] }>('data/places-auto.geojson').features;
const all = new Map([...featured, ...auto].map((f) => [f.properties.id, { ...f.properties, lngLat: f.geometry.coordinates }]));
// A tapped map POI: no curated id, the OSM name only.
all.set('osm:tapped', { ...all.get('kiz-kulesi')!, id: 'osm:tapped', osm: '' });

const deps: PlanDeps = {
  place: (id) => all.get(id),
  event: () => undefined,
  openAt: (h, ms) => openAt(h, ms),
  piers,
  getDay,
  timetableValid: (d) => timetableStatus(tt, d) === 'valid',
};
const plan = (...refs: string[]) => {
  let p = createPlan('evening', '2026-10-12');
  for (const r of refs) p = addPlace(p, r, all.get(r)!.name, 'view');
  return p;
};

describe('islet flag', () => {
  it('flags Kız Kulesi by id, OSM element and name; nothing else in the shipped catalogue', () => {
    expect(isIslet({ id: 'kiz-kulesi' })).toBe(true);
    expect(isIslet({ id: 'x', osm: 'relation/4429796' })).toBe(true);
    expect(isIslet({ id: 'x', name: 'KIZ KULESİ' })).toBe(true);
    expect(isIslet({ id: 'x', name: 'Whatever', nameEn: "Maiden’s Tower" })).toBe(true);
    const flagged = [...all.values()].filter((p) => isIslet(p) && p.id !== 'osm:tapped').map((p) => p.id);
    expect(flagged).toEqual(['kiz-kulesi']);
  });

  it('Adalar island places (with a ferry pier) are not flagged', () => {
    for (const id of ['yucetepe-kir-gazinosu', 'lunapark-restaurant', 'adalar-muzesi-w1000250944', 'sait-faik-abasiyanik-museum-n9967219116']) {
      expect(all.has(id)).toBe(true);
      expect(isIslet(all.get(id)!)).toBe(false);
    }
  });

  it('matching is data-driven', () => {
    const f = makeIsletCheck([{ id: 'a', names: ['Foo Islet'] }]);
    expect(f({ name: 'foo islet' })).toBe(true);
    expect(f({ id: 'b', name: 'Bar' })).toBe(false);
  });
});

describe('plan legs to and from an islet', () => {
  it('Galata Tower → Maiden’s Tower: "No transport info", not a walk or a ferry to Üsküdar', () => {
    const [day] = buildTimeline(plan('galata-kulesi', 'kiz-kulesi'), deps, lineStops);
    expect(day.stops.map((s) => s.islet)).toEqual([undefined, true]);
    expect(day.connections).toEqual([{ mode: 'none' }]);
  });

  it('the same in the other direction, and for a tapped map POI found by name', () => {
    expect(buildTimeline(plan('kiz-kulesi', 'galata-kulesi'), deps, lineStops)[0].connections).toEqual([{ mode: 'none' }]);
    expect(buildTimeline(plan('galata-kulesi', 'osm:tapped'), deps, lineStops)[0].connections).toEqual([{ mode: 'none' }]);
  });

  it('a stop next to the islet on the shore still connects normally (control)', () => {
    const [day] = buildTimeline(plan('galata-kulesi', 'uskudar-musahipzade-celal-sahnesi'), deps, lineStops);
    expect(day.connections[0].mode).not.toBe('none');
  });

  it('start / end points around an islet stop have no connection either', () => {
    const p = setEnds(plan('kiz-kulesi'), { start: { name: 'Hotel', ll: all.get('galata-kulesi')!.lngLat }, end: { name: 'Hotel', ll: all.get('galata-kulesi')!.lngLat } });
    const [day] = buildTimeline(p, deps, lineStops);
    expect(day.start?.conn).toEqual({ mode: 'none' });
    expect(day.end?.conn).toEqual({ mode: 'none' });
  });
});
