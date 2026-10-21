/**
 * Bebek ↔ Arnavutköy (Rumeli Kavağı – Eminönü) rounds Akıntıburnu close in (catalog `hug`, 2026-10-13):
 * printed 5 min apart, so the old wide sweep (1.55 / 1.67 km) needed a 31–33.5 km/h cruise. The lanes stay
 * off the land and ≥ the lane coast margin, keep to the right of travel, and no vessel comes near a boat on
 * that leg (the two directions meet once a day).
 */
import { readFileSync } from 'node:fs';
import type { FeatureCollection, LineString, MultiPolygon, Polygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import { timetableFiles } from './test-files';
import { DATA_BBOX } from '../../scripts/bbox';
import { localProj } from '../../scripts/lib/local-proj';
import { CoastIndex } from '../../scripts/lib/route-check';
import { ROUTE_RULES } from '../../scripts/lib/route-rules';
import { CONFIG } from '../config';
import { shorelineFromLand } from '../map/shoreline';
import { fleetAt, type VesselPose } from './fleet';
import { buildNetwork } from './network';
import { realTripSource } from './real';
import { buildDaySchedule } from './schedule';
import { cachedDays } from './state';
import { DAY_S } from './time';
import type { HolidayFile } from './timetable-data';
import type { LineSpec } from './types';

const json = <T>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const land = json<FeatureCollection<Polygon | MultiPolygon>>('data/land.geojson');
const routes = json<FeatureCollection<LineString, { id: string; from: string; to: string; lineId: string }>>('data/routes.geojson');
const files = timetableFiles(); // operator read windows pinned (test-files.ts)
const lines = json<{ lines: LineSpec[] }>('data/lines.json').lines;
const piers = json<{ features: { properties: { operator?: string; berths: { id: string; alongBearing: number; seawardBearing: number }[] } }[] }>('data/piers.geojson');
const net = buildNetwork(lines, routes as never, 41.05, piers.features.flatMap((f) => f.properties.berths.map((b) => ({ ...b, operator: f.properties.operator }))));
const real = realTripSource(files, json<HolidayFile>('data/catalog/holidays.json'), (id) => net.inputs.find((i) => i.line.id === id)!.legs);
const getDay = cachedDays((d) => buildDaySchedule(net.inputs, d, undefined, real), 8);
const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
const F = CONFIG.ferries;
const DOCK = { turnSeconds: F.dockTurnSeconds, berthBlendM: F.berthBlendM, slotPadS: F.slotPadS, tightTurnM: F.tightTurnM };
const LINE = 'rumeli-kavagi-eminonu';
const stops = lines.find((l) => l.id === LINE)!.stops;
const [BEBEK, ARNAVUTKOY] = [stops.indexOf('bebek'), stops.indexOf('arnavutkoy')];
const lane = (from: string, to: string) => routes.features.find((f) => f.properties.id === `${LINE}:${from}>${to}`)!;
const [w, s, , n] = DATA_BBOX;
const proj = localProj(w, s, (s + n) / 2);
const coast = new CoastIndex(shorelineFromLand(land, DATA_BBOX), land, proj);
const lengthM = (c: number[][]) => c.slice(1).reduce((t, p, i) => t + Math.hypot(...(proj.toXY(p as [number, number]).map((v, k) => v - proj.toXY(c[i] as [number, number])[k]) as [number, number])), 0);
const onLeg = (v: VesselPose) =>
  v.state.lineId === LINE &&
  v.state.phase === 'underway' &&
  ((v.state.fromStopIndex === BEBEK && v.state.nextStopIndex === ARNAVUTKOY) || (v.state.fromStopIndex === ARNAVUTKOY && v.state.nextStopIndex === BEBEK));

describe('Bebek ↔ Arnavutköy around Akıntıburnu', () => {
  it('both lanes stay off the land and keep the lane coast margin, shorter than the old wide sweep', () => {
    for (const [a, b, maxM] of [
      ['bebek', 'arnavutkoy', 1450], // was 1550
      ['arnavutkoy', 'bebek', 1600], // was 1670
    ] as const) {
      const c = lane(a, b).geometry.coordinates;
      const check = coast.checkLeg(c, ROUTE_RULES.minCoastM, ROUTE_RULES.endExemptM);
      expect(check.violations, `${a} → ${b}`).toEqual([]);
      expect(check.minCoastM).toBeGreaterThanOrEqual(CONFIG.routes.lanes.minCoastM);
      expect(lengthM(c)).toBeLessThan(maxM);
    }
  });

  it('every sailing of the leg cruises below the old 31 / 33.5 km/h', () => {
    for (const iso of ['2026-10-19', '2026-10-25']) {
      const legs = getDay(dayOf(iso)).vessels.filter((v) => v.lineId === LINE).flatMap((v) => v.segments).filter((g) => g.kind === 'leg' && [BEBEK, ARNAVUTKOY].includes(g.fromStop) && [BEBEK, ARNAVUTKOY].includes(g.toStop));
      expect(legs.length).toBeGreaterThan(10);
      for (const g of legs) if (g.kind === 'leg') expect(g.cruise * 3.6).toBeLessThan(g.fromStop === BEBEK ? 29.5 : 32);
    }
  });

  it('no vessel comes within a city-zoom hull beam of a boat on the leg (weekday and Sunday, 3 s steps)', () => {
    for (const iso of ['2026-10-19', '2026-10-25']) {
      let seen = 0;
      for (let t = 0; t < DAY_S; t += 3) {
        const fleet = fleetAt(getDay, net.paths, { day: dayOf(iso), seconds: t }, DOCK);
        for (const a of fleet.filter(onLeg)) {
          seen++;
          for (const b of fleet) {
            if (a === b) continue;
            const d = Math.hypot((a.lngLat[0] - b.lngLat[0]) * 84_000, (a.lngLat[1] - b.lngLat[1]) * 110_574);
            if (d < F.beamM * 3.9) expect.fail(`${a.state.vesselId} and ${b.state.vesselId} ${d.toFixed(0)} m apart, ${iso} ${(t / 3600).toFixed(2)} h`);
          }
        }
      }
      expect(seen).toBeGreaterThan(100);
    }
  }, 60_000);
});
