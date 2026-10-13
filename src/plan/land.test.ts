import { readFileSync } from 'node:fs';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { openAt } from '../places/store';
import { buildNetwork } from '../sim/network';
import { realTripSource, timetableStatus } from '../sim/real';
import { buildDaySchedule } from '../sim/schedule';
import { cachedDays } from '../sim/state';
import type { HolidayFile, TimetableFile } from '../sim/timetable-data';
import { makeLandIndex } from './land';
import { addPlace, createPlan, setEnds } from './model';
import { decodePlan } from './share';
import { buildTimeline, connect, type PlanDeps } from './timeline';

type LngLat = [number, number];
const json = <T,>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const landFc = json<FeatureCollection<Polygon | MultiPolygon>>('data/land.geojson');
const land = makeLandIndex(landFc);
const tt = json<TimetableFile>('data/timetables.json');
const holidays = json<HolidayFile>('data/catalog/holidays.json');
const lines = json<{ lines: { id: string; stops: string[] }[] }>('data/lines.json').lines;
const net = buildNetwork(lines as never, json('data/routes.geojson'), 41.05);
const real = realTripSource(tt, holidays, (id) => net.inputs.find((i) => i.line.id === id)!.legs);
const getDay = cachedDays((d) => buildDaySchedule(net.inputs, d, undefined, real), 8);
const piers = json<{ features: { properties: { id: string; name: string; nameEn: string }; geometry: { coordinates: LngLat } }[] }>('data/piers.geojson').features.map((f) => ({ ...f.properties, lngLat: f.geometry.coordinates }));
const pier = (id: string) => piers.find((p) => p.id === id)!.lngLat;
const lineStops = (id: string) => lines.find((l) => l.id === id)!.stops;

// Real places (coordinates from the shipped OSM-derived data, never typed).
type Feat = { properties: { id: string; name: string; nameEn: string | null; osm: string; hours: string | null }; geometry: { coordinates: LngLat } };
const all = new Map([...json<{ features: Feat[] }>('data/places.geojson').features, ...json<{ features: Feat[] }>('data/places-auto.geojson').features].map((f) => [f.properties.id, { ...f.properties, lngLat: f.geometry.coordinates }]));
const place = (id: string) => {
  const p = all.get(id);
  if (!p) throw new Error(`no place ${id}`);
  return p.lngLat;
};

const base: PlanDeps = {
  place: (id) => all.get(id),
  event: () => undefined,
  openAt: (h, ms) => openAt(h, ms),
  piers,
  getDay,
  timetableValid: (d) => timetableStatus(tt, d) === 'valid',
};
const deps: PlanDeps = { ...base, landOf: (p, snapM) => land.landOf(p, snapM) };
const READY = Date.parse('2026-10-12T18:00:00+03:00'); // a Monday evening, real timetable
const leg = (a: LngLat, b: LngLat, d = deps) => connect(d, a, b, READY, lineStops);
const km = (a: LngLat, b: LngLat) => {
  const kx = 111_320 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return (Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110_574) * CONFIG.plan.walk.factor) / 1000;
};

/** The closest pair of coastline vertices of two landmasses (real OSM coastline points). */
function closestShores(ma: number, mb: number): [LngLat, LngLat] {
  const polys = landFc.features.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
  let best: [LngLat, LngLat] = [[0, 0], [0, 0]];
  let d = Infinity;
  for (const a of polys[ma][0]) for (const b of polys[mb][0]) {
    const k = km(a as LngLat, b as LngLat);
    if (k < d) {
      d = k;
      best = [a as LngLat, b as LngLat];
    }
  }
  return best;
}

describe('landmass index (pure)', () => {
  // Two 1 km squares 300 m apart, from a synthetic origin (not a real place).
  const sq = (x0: number): number[][] => {
    const dx = 1000 / (111_320 * Math.cos((41 * Math.PI) / 180));
    const dy = 1000 / 110_574;
    return [[x0, 41], [x0 + dx, 41], [x0 + dx, 41 + dy], [x0, 41 + dy], [x0, 41]];
  };
  const mx = (m: number) => m / (111_320 * Math.cos((41 * Math.PI) / 180));
  const fc: FeatureCollection<MultiPolygon> = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [[sq(29)], [sq(29 + mx(1300))]] } }] };
  const idx = makeLandIndex(fc);
  const y = 41.0045;

  it('inside a polygon → its landmass', () => {
    expect(idx.landOf([29 + mx(500), y])).toBe(0);
    expect(idx.landOf([29 + mx(1800), y])).toBe(1);
  });
  it('a few metres off the edge snaps to the nearest polygon within 100 m; farther out → none', () => {
    expect(idx.landOf([29 + mx(1040), y])).toBe(0); // 40 m off square 0, 260 m off square 1
    expect(idx.landOf([29 + mx(1240), y])).toBe(1); // 60 m off square 1
    expect(idx.landOf([29 + mx(1150), y])).toBe(null); // 150 m from both
    expect(idx.landOf([29 + mx(1140), y], 250)).toBe(0); // a pier's wider snap: the nearest polygon wins
    expect(idx.landOf([29 + mx(1160), y], 250)).toBe(1);
    expect(idx.landOf([29 - mx(99), y])).toBe(0);
    expect(idx.landOf([29 - mx(101), y])).toBe(null);
  });
  it('sameLand: one polygon yes, two polygons or off land no', () => {
    expect(idx.sameLand([29 + mx(10), y], [29 + mx(990), y])).toBe(true);
    expect(idx.sameLand([29 + mx(990), y], [29 + mx(1310), y])).toBe(false);
    expect(idx.sameLand([29 + mx(1150), y], [29 + mx(1150), y])).toBe(false);
  });
});

describe('landmasses in data/land.geojson', () => {
  it('the Golden Horn does not split the European side: Eminönü, Karaköy, Galata, Sultanahmet, Fener / Balat shores are one landmass', () => {
    const eu = land.landOf(pier('eminonu'));
    expect(eu).not.toBeNull();
    for (const p of [pier('karakoy'), pier('kabatas'), pier('besiktas'), place('galata-kulesi'), place('turk-ve-islam-eserleri-muzesi-n5113500256'), place('istanbul-arkeoloji-muzeleri-w335374188')]) expect(land.landOf(p)).toBe(eu);
  });
  it('Asian side, each Adalar island and the European side are different landmasses', () => {
    const m = (p: LngLat) => land.landOf(p, CONFIG.plan.walk.pierSnapM);
    const masses = ['eminonu', 'uskudar', 'kinaliada', 'burgazada', 'heybeliada', 'buyukada'].map((id) => m(pier(id)));
    expect(masses.every((x) => x !== null)).toBe(true);
    expect(new Set(masses).size).toBe(6);
    expect(m(pier('kadikoy'))).toBe(m(pier('uskudar')));
  });
  it('every pier gets a landmass (pier heads over the water snap within 250 m; Büyükada is 151 m out)', () => {
    for (const p of piers) expect(land.landOf(p.lngLat, CONFIG.plan.walk.pierSnapM), p.id).not.toBeNull();
    expect(land.landOf(pier('buyukada'))).toBeNull(); // the plain 100 m snap would miss it
    expect(land.landOf(pier('buyukada'), CONFIG.plan.walk.pierSnapM)).toBe(land.landOf(place('adalar-muzesi-w1000250944')));
  });
  it('every featured place is on a landmass except Kız Kulesi (its islet is not in the simplified coastline)', () => {
    const off = [...all.values()].filter((p) => land.landOf(p.lngLat) === null).map((p) => p.id);
    expect(off).toEqual(['kiz-kulesi']);
  });
});

describe('planner walks only on one landmass', () => {
  it('Karaköy ↔ Eminönü (across the Galata Bridge): walk', () => {
    expect(leg(pier('karakoy'), pier('eminonu')).mode).toBe('walk');
    expect(leg(pier('eminonu'), pier('karakoy')).mode).toBe('walk');
  });

  it('Galata Tower ↔ Sultanahmet: walk to the Archaeology Museums (Gülhane, 2.1 km); the Hippodrome is past the 2.5 km cap', () => {
    const arkeoloji = place('istanbul-arkeoloji-muzeleri-w335374188');
    expect(leg(place('galata-kulesi'), arkeoloji).mode).toBe('walk');
    expect(leg(arkeoloji, place('galata-kulesi')).mode).toBe('walk');
    // Türk ve İslam Eserleri Müzesi (on the Hippodrome) is on the same land but 2.8 km × 1.3: the
    // distance rule, not the land rule, says no walk — same as before this check.
    const hippodrome = place('turk-ve-islam-eserleri-muzesi-n5113500256');
    expect(land.sameLand(place('galata-kulesi'), hippodrome)).toBe(true);
    expect(km(place('galata-kulesi'), hippodrome)).toBeGreaterThan(CONFIG.plan.walk.maxKm);
    expect(leg(place('galata-kulesi'), hippodrome).mode).toBe(leg(place('galata-kulesi'), hippodrome, base).mode);
  });

  it('Kadıköy ↔ Moda: walk', () => {
    for (const id of ['moda-burnu', 'kont-moda', 'moda-bostani-w733562891']) {
      expect(leg(pier('kadikoy'), place(id)).mode).toBe('walk');
      expect(leg(place(id), pier('kadikoy')).mode).toBe('walk');
    }
  });

  it('Beşiktaş ↔ Üsküdar (2.0 km × 1.3, across the Bosphorus): no walk — a ferry or no transport info', () => {
    expect(leg(pier('besiktas'), pier('uskudar'), base).mode).toBe('walk'); // what it said before
    for (const [a, b] of [[pier('besiktas'), pier('uskudar')], [pier('uskudar'), pier('besiktas')]]) {
      const c = leg(a, b);
      expect(c.mode).not.toBe('walk');
      if (c.mode === 'ferry') {
        expect(land.sameLand(a, pier(c.fromPier))).toBe(true);
        expect(land.landOf(pier(c.toPier), CONFIG.plan.walk.pierSnapM)).toBe(land.landOf(b, CONFIG.plan.walk.pierSnapM));
      }
    }
  });

  it('Burgazada ↔ Heybeliada: no walk (closest shores ~1 km apart; real places are ≥ 2.9 km)', () => {
    const bm = land.landOf(pier('burgazada'))!;
    const hm = land.landOf(pier('heybeliada'))!;
    const [a, b] = closestShores(bm, hm);
    expect(km(a, b)).toBeLessThan(CONFIG.plan.walk.maxKm);
    expect(leg(a, b, base).mode).toBe('walk'); // before
    expect(leg(a, b).mode).not.toBe('walk');
    expect(leg(b, a).mode).not.toBe('walk');
    expect(land.sameLand(place('sait-faik-abasiyanik-museum-n9967219116'), place('ismet-inonu-house-museum-n9967223417'))).toBe(false);
  });

  it('a place and its own pier: walk (also Büyükada, whose pier head is off the coastline)', () => {
    expect(leg(place('d-orient-buyukada-n9897855978'), pier('buyukada')).mode).toBe('walk');
    expect(leg(pier('buyukada'), place('d-orient-buyukada-n9897855978')).mode).toBe('walk');
    expect(leg(place('sait-faik-abasiyanik-museum-n9967219116'), pier('burgazada')).mode).toBe('walk');
    expect(leg(place('moda-burnu'), pier('kadikoy')).mode).toBe('walk');
    expect(leg(place('galata-kulesi'), pier('karakoy')).mode).toBe('walk');
  });

  it('a ferry walks to and from piers on its own landmass only (Büyükada café → Kadıköy uses the island pier)', () => {
    const c = leg(place('d-orient-buyukada-n9897855978'), pier('kadikoy'));
    expect(c.mode).toBe('ferry');
    if (c.mode === 'ferry') {
      expect(c.fromPier).toBe('buyukada');
      expect(c.toPier).toBe('kadikoy');
    }
  });

  it('Kız Kulesi: no walk, no ferry (islet flag and off every landmass), unchanged', () => {
    const p = createPlan('evening', '2026-10-12');
    const pl = addPlace(addPlace(p, 'galata-kulesi', 'Galata', 'view'), 'kiz-kulesi', 'Kız Kulesi', 'view');
    expect(buildTimeline(pl, deps, lineStops)[0].connections).toEqual([{ mode: 'none' }]);
    // Even without the flag its position is on no landmass: nothing to walk to.
    expect(leg(place('kiz-kulesi'), pier('uskudar'))).toEqual({ mode: 'none' });
  });

  it('start / end points follow the same rule (hotel in Beşiktaş, stop in Üsküdar)', () => {
    let p = addPlace(createPlan('evening', '2026-10-12'), 'uskudar-musahipzade-celal-sahnesi', 'Musahipzade', 'culture');
    p = setEnds(p, { start: { name: 'Hotel', ll: pier('besiktas') }, end: { name: 'Hotel', ll: pier('besiktas') } });
    const [day] = buildTimeline(p, deps, lineStops);
    expect(day.start?.conn.mode).not.toBe('walk');
    expect(day.end?.conn.mode).not.toBe('walk');
    // A start point tapped on open water (500 m off the shore) is on no landmass: no transport info.
    const sea: LngLat = [(pier('besiktas')[0] + pier('uskudar')[0]) / 2, (pier('besiktas')[1] + pier('uskudar')[1]) / 2];
    expect(land.landOf(sea)).toBeNull();
    const [d2] = buildTimeline(setEnds(p, { start: { name: 'Boat', ll: sea } }), deps, lineStops);
    expect(d2.start?.conn).toEqual({ mode: 'none' });
  });

  it('an old share link (no land data then) still opens and recomputes', () => {
    const old = '1.eyJrIjoibSIsImYiOiIyMDI2LTEwLTEyIiwibiI6MiwicyI6W1swLCJtb2RhIiwwLDYwMCw5MCwiTW9kYSJdLFswLCJub2RlLzEyMyIsMCw3MDUsOTAsIkEgUE9JIiwyOS4wMjUxMiw0MC45ODc2NV0sWzEsImNvbmNlcnQiLDAsMTI2MCwxMjAsIkNvbmNlcnQiXV19';
    const plan = decodePlan(old);
    expect(plan).not.toBeNull();
    const days = buildTimeline(plan!, deps, lineStops);
    expect(days.length).toBeGreaterThan(0);
  });
});
