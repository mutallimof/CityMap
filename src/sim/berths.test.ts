import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { assignSlots, daySlots } from './berths';
import { berthOffset, fleetAt, type VesselPose } from './fleet';
import { buildNetwork } from './network';
import { realTripSource } from './real';
import { buildDaySchedule } from './schedule';
import { cachedDays } from './state';
import { DAY_S } from './time';
import type { HolidayFile, TimetableFile } from './timetable-data';

const json = <T>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const tt = json<TimetableFile>('data/timetables.json');
const holidays = json<HolidayFile>('data/catalog/holidays.json');
const piers = json<{ features: { properties: { id: string; berths: { id: string; alongBearing: number; seawardBearing: number }[] } }[] }>('data/piers.geojson');
const net = buildNetwork(
  json<{ lines: never[] }>('data/lines.json').lines,
  json('data/routes.geojson'),
  41.05,
  piers.features.flatMap((f) => f.properties.berths),
);
const legsOf = (id: string) => net.inputs.find((i) => i.line.id === id)!.legs;
const real = realTripSource(tt, holidays, legsOf);
const getDay = cachedDays((d) => buildDaySchedule(net.inputs, d, undefined, real), 8);
const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
const pierOfBerth = new Map(piers.features.flatMap((f) => f.properties.berths.map((b) => [b.id, f.properties.id] as const)));
const F = CONFIG.ferries;
const DOCK = { turnSeconds: F.dockTurnSeconds, berthBlendM: F.berthBlendM, slotPadS: F.slotPadS, tightTurnM: F.tightTurnM };
const SLOTS = { padS: F.slotPadS, turnS: F.dockTurnSeconds };

type Hull = { id: string; pier: string; berth: string; x: number; y: number; h: number };

/** Drawn hull of a docked vessel (local metres around the pier area), at hull exaggeration `exag`. */
function hull(v: VesselPose, exag: number): Hull {
  const [ox, oy] = berthOffset(v.berth, { beamM: F.beamM * exag, quayClearance: F.quayClearance, berthOffsetM: F.berthOffsetM, slotSpacing: F.slotSpacing, lengthM: F.lengthM * exag });
  return { id: v.state.vesselId, pier: pierOfBerth.get(v.berth!.berthId)!, berth: v.berth!.berthId, x: v.lngLat[0] * 84_000 + ox, y: v.lngLat[1] * 110_574 + oy, h: v.bearing };
}

/** Oriented rectangles (length × beam) overlap — separating axis test. */
function overlap(a: Hull, b: Hull, L: number, B: number): boolean {
  const axes = (h: number) => {
    const r = (h * Math.PI) / 180;
    return [
      [Math.sin(r), Math.cos(r)],
      [Math.cos(r), -Math.sin(r)],
    ];
  };
  const corners = (c: Hull) => {
    const [f, s] = axes(c.h);
    return [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ].map(([i, j]) => [c.x + (f[0] * L * i + s[0] * B * j) / 2, c.y + (f[1] * L * i + s[1] * B * j) / 2]);
  };
  const ca = corners(a);
  const cb = corners(b);
  for (const [ax, ay] of [...axes(a.h), ...axes(b.h)]) {
    const pa = ca.map(([x, y]) => x * ax + y * ay);
    const pb = cb.map(([x, y]) => x * ax + y * ay);
    if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
  }
  return true;
}

describe('docked ferries moor side by side', () => {
  for (const [name, iso] of [
    ['weekday', '2026-10-12'],
    ['Sunday', '2026-10-18'],
  ] as const) {
    it(`no two docked ferries overlap at any pier over a whole ${name} (real size and city-zoom hulls)`, () => {
      const day = dayOf(iso);
      let maxAbreast = 0;
      for (const exag of [1, 3.9]) {
        const L = F.lengthM * exag;
        const B = F.beamM * exag;
        for (let s = 0; s < DAY_S; s += 15) {
          const docked = fleetAt(getDay, net.paths, { day, seconds: s }, DOCK)
            .filter((v) => v.state.phase === 'docked' && v.berth)
            .map((v) => hull(v, exag));
          for (let i = 0; i < docked.length; i++)
            for (let j = i + 1; j < docked.length; j++) {
              const [a, b] = [docked[i], docked[j]];
              // Separate OSM berths of a pier (Eminönü 127 m, Beşiktaş 280 m apart) spread apart for long drawn hulls.
              if (a.pier !== b.pier) continue;
              if (overlap(a, b, L, B)) expect.fail(`${a.id} and ${b.id} overlap at ${a.pier}, ${iso} ${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} (×${exag})`);
            }
          const perPier = new Map<string, number>();
          for (const h of docked) perPier.set(h.pier, (perPier.get(h.pier) ?? 0) + 1);
          maxAbreast = Math.max(maxAbreast, ...perPier.values());
        }
      }
      // Kadıköy really does get busy: several vessels wait there at once.
      expect(maxAbreast).toBeGreaterThanOrEqual(2);
    }, 60_000);
  }

  it('arrivals and departures stay smooth with slots and sailed turns (1 s steps, drawn position incl. slot offset)', () => {
    const day = dayOf('2026-10-12');
    const exag = 3.9;
    // Underway speed + the slot offset easing in/out over the berth blend.
    const maxStep = (34 / 3.6) * 1.02 + 6;
    let prev = new Map<string, { x: number; y: number; h: number }>();
    for (let s = 0; s < DAY_S; s += 1) {
      const next = new Map<string, { x: number; y: number; h: number }>();
      for (const v of fleetAt(getDay, net.paths, { day, seconds: s }, DOCK)) {
        const [ox, oy] = berthOffset(v.berth, { beamM: F.beamM * exag, quayClearance: F.quayClearance, berthOffsetM: F.berthOffsetM, slotSpacing: F.slotSpacing, lengthM: F.lengthM * exag });
        const c = { x: v.lngLat[0] * 84_000 + ox, y: v.lngLat[1] * 110_574 + oy, h: v.bearing };
        const q = prev.get(v.state.vesselId);
        if (q && Math.hypot(c.x - q.x, c.y - q.y) >= maxStep) expect.fail(`${v.state.vesselId} jumped ${Math.hypot(c.x - q.x, c.y - q.y).toFixed(1)} m at ${s}`);
        if (q && Math.abs(((c.h - q.h + 540) % 360) - 180) >= 15) expect.fail(`${v.state.vesselId} heading snapped at ${s}`);
        next.set(v.state.vesselId, c);
      }
      prev = next;
    }
  }, 60_000);

  it('a vessel reaching or leaving an inner slot never sails through one moored outside it (slides along the quay)', () => {
    const day = dayOf('2026-10-12');
    // Street-zoom hulls (×1.3): never. City-zoom hulls (×3.9, 273 m) on the 450 m Karaköy legs: a few seconds a day.
    for (const [exag, maxS] of [
      [1.3, 0],
      [3.9, 60],
    ] as const) {
      const L = F.lengthM * exag * 0.9;
      const B = F.beamM * exag * 0.9;
      let seconds = 0;
      for (let s = 0; s < DAY_S; s += 5) {
        const all = fleetAt(getDay, net.paths, { day, seconds: s }, { ...DOCK, hullM: F.lengthM * exag }).filter((v) => v.berth);
        const moored = all.filter((v) => v.state.phase === 'docked');
        for (const m of all) {
          if (m.state.phase !== 'underway' || m.berth!.weight <= 0) continue;
          for (const d of moored) if (d.berth!.berthId === m.berth!.berthId && d.berth!.slot > m.berth!.slot && overlap(hull(m, exag), hull(d, exag), L, B)) seconds += 5;
        }
      }
      expect(seconds, `×${exag}`).toBeLessThanOrEqual(maxS);
    }
  }, 120_000);

  it('the quay slides stay smooth (1 s steps, city-zoom hulls)', () => {
    const day = dayOf('2026-10-12');
    const exag = 3.9;
    const params = { ...DOCK, hullM: F.lengthM * exag };
    let prev = new Map<string, { x: number; y: number; h: number }>();
    // A slide covers 1.2 hull lengths while the route advances half the slide distance: a little faster than sailing.
    const maxStep = (34 / 3.6) * 2.4 + 6;
    for (let s = 6 * 3600; s < 10 * 3600; s += 1) {
      const next = new Map<string, { x: number; y: number; h: number }>();
      for (const v of fleetAt(getDay, net.paths, { day, seconds: s }, params)) {
        const [ox, oy] = berthOffset(v.berth, { beamM: F.beamM * exag, quayClearance: F.quayClearance, berthOffsetM: F.berthOffsetM, slotSpacing: F.slotSpacing, lengthM: F.lengthM * exag });
        const c = { x: v.lngLat[0] * 84_000 + ox, y: v.lngLat[1] * 110_574 + oy, h: v.bearing };
        const q = prev.get(v.state.vesselId);
        if (q && Math.hypot(c.x - q.x, c.y - q.y) >= maxStep) expect.fail(`${v.state.vesselId} jumped ${Math.hypot(c.x - q.x, c.y - q.y).toFixed(1)} m at ${s}`);
        if (q && Math.abs(((c.h - q.h + 540) % 360) - 180) >= 15) expect.fail(`${v.state.vesselId} heading snapped at ${s}`);
        next.set(v.state.vesselId, c);
      }
      prev = next;
    }
  }, 120_000);

  it('a stay keeps its slot across midnight (previous day carried in with the same slots)', () => {
    for (const iso of ['2026-10-13', '2026-10-17', '2026-10-18']) {
      const day = dayOf(iso);
      const prev = getDay(day - 1);
      const carried = assignSlots(prev, net.paths, DOCK.slotPadS);
      const used = daySlots(getDay, day - 1, net.paths, SLOTS);
      for (const v of prev.vessels)
        for (const seg of v.segments) if (seg.kind === 'dock' && seg.t1 + 2 * DOCK.slotPadS > DAY_S) expect(used.get(seg)!.slot).toBe(carried.get(seg));
    }
  });

  it('the lowest free slot, held until departure (padded on both sides)', () => {
    const dock = (t0: number, t1: number) => ({ kind: 'dock' as const, t0, t1, stopIndex: 0, arrive: null, depart: null });
    const a = dock(0, 1000);
    const b = dock(100, 500);
    const c = dock(800, 900); // b's slot is free again (500 + 120 < 800 − 120)
    const d = dock(1300, 2000); // everyone gone → the quay
    const e = dock(1500, 1600);
    const sched = { day: 0, departures: [], vessels: [a, b, c, d, e].map((s, i) => ({ id: `v${i}`, lineId: 'x', segments: [s] })) };
    const slots = assignSlots(sched, new Map(), 120);
    expect([a, b, c, d, e].map((s) => slots.get(s))).toEqual([0, 1, 1, 0, 1]);
  });
});
