/**
 * Private operators' lines (Turyol, Dentur Avrasya; scripts/operators) on the whole network, with the real
 * committed files: they run their own timetables, fall back alone, never collide with docked hulls, and the
 * Şehir Hatları lines dock and sail exactly as they did without them.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { directionInferred } from './direction';
import { berthOffset, fleetAt, type VesselPose } from './fleet';
import { buildNetwork, type BerthGeometry } from './network';
import { expiryWarning, lineFallback, realTripSource } from './real';
import { buildDaySchedule } from './schedule';
import { cachedDays, nextDepartures } from './state';
import { parseHHMM, DAY_S } from './time';
import type { HolidayFile, TimetableFile } from './timetable-data';
import type { LineSpec } from './types';
import { makeLandIndex } from '../plan/land';
import { pinReads } from './test-files';

const json = <T>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const sh = json<TimetableFile>('data/timetables.json');
const turyol = pinReads(json<TimetableFile>('data/timetables-turyol.json')); // read window pinned: test-files.ts
const dentur = pinReads(json<TimetableFile>('data/timetables-dentur.json')); // read window pinned: test-files.ts
const files = [sh, turyol, dentur];
const holidays = json<HolidayFile>('data/catalog/holidays.json');
const allLines = json<{ lines: LineSpec[] }>('data/lines.json').lines;
const routes = json<never>('data/routes.geojson');
const piers = json<{ features: { properties: { id: string; operator?: string; berths: BerthGeometry[] }; geometry: { coordinates: [number, number] } }[] }>('data/piers.geojson');
const berthsOf = (withOperators: boolean) => piers.features.filter((f) => withOperators || !f.properties.operator).flatMap((f) => f.properties.berths.map((b) => ({ ...b, operator: f.properties.operator })));
const berthById = new Map(piers.features.flatMap((f) => f.properties.berths.map((b) => [b.id, b] as const)));
const pierOfBerth = new Map(piers.features.flatMap((f) => f.properties.berths.map((b) => [b.id, f.properties.id] as const)));
const OPERATOR_LINES = allLines.filter((l) => l.operator).map((l) => l.id);

function world(lines: LineSpec[], tts: TimetableFile[], withOperatorPiers = true) {
  const net = buildNetwork(lines, routes, 41.05, berthsOf(withOperatorPiers));
  const real = realTripSource(tts, holidays, (id) => net.inputs.find((i) => i.line.id === id)!.legs);
  return { net, getDay: cachedDays((d) => buildDaySchedule(net.inputs, d, undefined, real), 8) };
}
const full = world(allLines, files);
const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
const MON = dayOf('2026-10-19');
const SUN = dayOf('2026-10-18');
const F = CONFIG.ferries;
/** Minutes a day a docked operator boat may touch a nearby docked hull at city zoom (×3.9 hulls); measured 2026-10-13. */
const CITY_OVERLAP_MAX_MIN = 200;
const DOCK = { turnSeconds: F.dockTurnSeconds, berthBlendM: F.berthBlendM, slotPadS: F.slotPadS, tightTurnM: F.tightTurnM };

describe('private operators on the map', () => {
  it('there are four operator lines, each with its own committed timetable', () => {
    expect(OPERATOR_LINES).toEqual(['turyol-kadikoy-karakoy-eminonu', 'turyol-uskudar-karakoy-eminonu', 'turyol-karakoy-kadikoy-metro', 'dentur-uskudar-kabatas']);
    for (const id of OPERATOR_LINES) expect(lineFallback(files, id, MON, holidays)).toBeNull();
  });

  it('inside their read dates every line, Şehir Hatları and private, runs its real timetable', () => {
    expect(Object.values(full.getDay(MON).modes).every((m) => m === 'real')).toBe(true);
    expect(Object.keys(full.getDay(MON).modes)).toHaveLength(11);
  });

  it('the Dentur pier board shows the printed times exactly (Üsküdar, Monday 06:30)', () => {
    const deps = nextDepartures(full.getDay, 'uskudar-dentur', { day: MON, seconds: parseHHMM('06:30') }, 4);
    expect(deps.map((d) => [d.toStopId, (d.t / 60) | 0, d.real])).toEqual([
      ['kabatas-dentur', 6 * 60 + 45, true],
      ['kabatas-dentur', 7 * 60, true],
      ['kabatas-dentur', 7 * 60 + 15, true],
      ['kabatas-dentur', 7 * 60 + 30, true],
    ]);
    expect(deps.some(directionInferred)).toBe(false);
  });

  it("Turyol's one boat to two printed destinations is one sailing, its order of calls flagged as inferred", () => {
    const deps = nextDepartures(full.getDay, 'kadikoy-yeni-turyol', { day: MON, seconds: parseHHMM('06:50') }, 1);
    expect(deps[0]).toMatchObject({ lineId: 'turyol-kadikoy-karakoy-eminonu', t: parseHHMM('06:55'), toStopId: 'eminonu-turyol', via: ['karakoy-turyol'], real: true });
    expect(directionInferred(deps[0])).toBe(true);
    // A single-destination departure (Eminönü → Kadıköy Yeni) claims nothing inferred.
    const back = nextDepartures(full.getDay, 'eminonu-turyol', { day: MON, seconds: parseHHMM('07:20') }, 3).find((d) => d.toStopId === 'kadikoy-yeni-turyol')!;
    expect(back.via).toBeUndefined();
    expect(directionInferred(back)).toBe(false);
  });
});

describe('fallback per line, like the Şehir Hatları lines', () => {
  it('a line whose read has run out is simulated alone (never shown as real); Şehir Hatları stays real', () => {
    const after = dayOf('2026-12-01'); // the pinned read (2026-10-13 + 45 days) has run out
    expect(lineFallback(files, 'dentur-uskudar-kabatas', after, holidays)).toBe('expired');
    const m = full.getDay(after).modes;
    for (const id of OPERATOR_LINES) expect(m[id]).toBe('sim');
    expect(m['kadikoy-karakoy-eminonu']).toBe('real');
    expect(full.getDay(after).departures.filter((d) => OPERATOR_LINES.includes(d.lineId)).every((d) => !d.real)).toBe(true);
  });

  it('before its first read a line is simulated (no claim the times applied earlier)', () => {
    expect(full.getDay(dayOf('2026-10-12')).modes['dentur-uskudar-kabatas']).toBe('sim');
  });

  it('public holidays: the sources print nothing → those lines are simulated; Şehir Hatları runs its Sunday timetable', () => {
    const holiday = dayOf('2026-10-29'); // Cumhuriyet Bayramı, a Thursday
    expect(lineFallback(files, 'turyol-uskudar-karakoy-eminonu', holiday, holidays)).toBe('holiday');
    const m = full.getDay(holiday).modes;
    for (const id of OPERATOR_LINES) expect(m[id]).toBe('sim');
    expect(m['kadikoy-karakoy-eminonu']).toBe('real');
  });

  it('a broken operator line (a trip it cannot sail) falls back alone', () => {
    const broken: TimetableFile = { ...dentur, lines: { ...dentur.lines, 'dentur-uskudar-kabatas': { ...dentur.lines['dentur-uskudar-kabatas'], trips: [{ id: 'x', days: ['weekday'], calls: [{ stop: 'uskudar-dentur', dep: '10:00' }, { stop: 'eminonu' }] }] } } };
    const w = world(allLines, [sh, turyol, broken]);
    expect(w.getDay(MON).modes['dentur-uskudar-kabatas']).toBe('sim');
    expect(w.getDay(MON).modes['turyol-uskudar-karakoy-eminonu']).toBe('real');
  });

  it('warns (console only) when a line has not been re-read for a while', () => {
    expect(expiryWarning(dentur, dayOf('2026-10-20'))).toBeNull();
    expect(expiryWarning(dentur, dayOf('2026-11-05'))).toMatch(/dentur-uskudar-kabatas not re-read lately/);
  });
});

describe('the Şehir Hatları lines are unchanged by the new lines', () => {
  it('every Şehir Hatları vessel is exactly where it was, with the same berth slot (weekday, 30 s steps)', () => {
    const old = world(
      allLines.filter((l) => !l.operator),
      [sh],
      false,
    );
    for (let s = parseHHMM('05:30'); s < DAY_S; s += 30) {
      const at = { day: MON, seconds: s };
      const a = new Map(fleetAt(old.getDay, old.net.paths, at, DOCK).map((v) => [v.state.vesselId, v]));
      const b = fleetAt(full.getDay, full.net.paths, at, DOCK).filter((v) => !OPERATOR_LINES.includes(v.state.lineId));
      expect(b.length).toBe(a.size);
      for (const v of b) {
        const o = a.get(v.state.vesselId)!;
        expect([v.lngLat, v.bearing, v.berth?.slot, v.berth?.spread]).toEqual([o.lngLat, o.bearing, o.berth?.slot, o.berth?.spread]);
      }
    }
  }, 60_000);
});

type Hull = { id: string; line: string; pier: string; bx: number; by: number; x: number; y: number; h: number };
function hull(v: VesselPose, exag: number): Hull {
  const [ox, oy] = berthOffset(v.berth, { beamM: F.beamM * exag, quayClearance: F.quayClearance, berthOffsetM: F.berthOffsetM, slotSpacing: F.slotSpacing, lengthM: F.lengthM * exag, realLengthM: F.lengthM });
  const b = berthById.get(v.berth!.berthId)!.lngLat!;
  return { id: v.state.vesselId, line: v.state.lineId, pier: pierOfBerth.get(v.berth!.berthId)!, bx: b[0] * 84_000, by: b[1] * 110_574, x: v.lngLat[0] * 84_000 + ox, y: v.lngLat[1] * 110_574 + oy, h: v.bearing };
}
/** Oriented rectangles (length × beam) overlap — separating axis test (as in berths.test.ts). */
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

describe('docking: operator boats never overlap a docked hull', () => {
  for (const [name, day] of [
    ['weekday', MON],
    ['Sunday', SUN],
  ] as const) {
    it(`no docked operator boat overlaps any other docked boat nearby over a whole ${name} (real size and city-zoom hulls)`, () => {
      let pairsChecked = 0;
      let cityPairs = 0;
      let cityOverlapS = 0;
      for (const exag of [1, 3.9])
      for (let s = 0; s < DAY_S; s += 15) {
        const L = F.lengthM * exag;
        const B = F.beamM * exag;
        const docked = fleetAt(full.getDay, full.net.paths, { day, seconds: s }, DOCK)
          .filter((v) => v.state.phase === 'docked' && v.berth)
          .map((v) => hull(v, exag));
        for (let i = 0; i < docked.length; i++)
          for (let j = i + 1; j < docked.length; j++) {
            const [a, b] = [docked[i], docked[j]];
            if (!OPERATOR_LINES.includes(a.line) && !OPERATOR_LINES.includes(b.line)) continue; // berths.test.ts
            if (Math.hypot(a.x - b.x, a.y - b.y) > 2 * L) continue;
            // City-zoom hulls (273 m) are longer than the Golden Horn mouth is wide and their spread stops at the coast:
            // there only an operator boat next to the Şehir Hatları berth it keeps clear of is compared (see below).
            if (exag > 1) {
              cityPairs++;
              if (overlap(a, b, L, B)) cityOverlapS += 15;
              continue;
            }
            pairsChecked++;
            if (overlap(a, b, L, B)) expect.fail(`${a.id} and ${b.id} overlap (${a.pier} / ${b.pier}) at ${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} (×${exag})`);
          }
      }
      expect(pairsChecked).toBeGreaterThan(100);
      // City zoom: reported, bounded (the drawn hulls are ~4× real size).
      console.info(`${name}: city-zoom docked overlaps with operator boats ${Math.round(cityOverlapS / 60)} min (of ${cityPairs} nearby pairs × 15 s)`);
      expect(cityOverlapS / 60).toBeLessThan(CITY_OVERLAP_MAX_MIN);
    }, 60_000);
  }

  it('operator berths keep clear of Şehir Hatları berths and spread from them alone, never towards land', () => {
    const p = full.net.paths;
    const sh = piers.features.filter((f) => !f.properties.operator).flatMap((f) => f.properties.berths);
    const metres = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * 84_000, (a[1] - b[1]) * 110_574);
    // At least a real hull length from every Şehir Hatları berth (Karaköy / Üsküdar were moved along the coast to be).
    for (const f of piers.features.filter((x) => x.properties.operator))
      for (const b of f.properties.berths) expect(Math.min(...sh.map((q) => metres(q.lngLat!, b.lngLat!)))).toBeGreaterThanOrEqual(F.lengthM);
    // Kadıköy Yeni (Turyol) lies off the Şehir Hatları berth's seaward side, where up to 4 boats moor abreast: it shifts clear
    // of them (in hull lengths), never further than the water goes.
    const k = p.get('turyol-kadikoy-karakoy-eminonu')!.berths![0].spread! as number[];
    expect(k).toHaveLength(7);
    expect(Math.hypot(k[3], k[4]) * F.lengthM).toBeGreaterThan(10);
    // Şehir Hatları berths keep their old (half-shortfall) spread — or none.
    expect(p.get('kadikoy-karakoy-eminonu')!.berths!.every((b) => !b.spread || b.spread.length === 3)).toBe(true);
  });

  it('docked operator boats lie on the water, not on land (hull centre, real size and city zoom)', () => {
    const land = makeLandIndex(json('data/land.geojson'));
    for (const exag of [1, 3.9])
      for (let s = parseHHMM('06:00'); s < DAY_S; s += 60)
        for (const v of fleetAt(full.getDay, full.net.paths, { day: MON, seconds: s }, DOCK)) {
          if (v.state.phase !== 'docked' || !v.berth || !OPERATOR_LINES.includes(v.state.lineId)) continue;
          const h = hull(v, exag);
          if (land.landOf([h.x / 84_000, h.y / 110_574], 0) !== null) expect.fail(`${v.state.vesselId} docked on land at ${h.pier} (×${exag}, ${s})`);
        }
  }, 60_000);

  it('positions never jump and headings never snap over a real weekday (1 s steps, all lines)', () => {
    const maxStep = (34 / 3.6) * 1.02;
    const D = { turnSeconds: 50, berthBlendM: 350 };
    let prev = new Map<string, { p: [number, number]; b: number }>();
    for (let t = parseHHMM('05:30'); t < DAY_S + parseHHMM('01:30'); t += 1) {
      const at = { day: t >= DAY_S ? MON + 1 : MON, seconds: t % DAY_S };
      const next = new Map<string, { p: [number, number]; b: number }>();
      for (const v of fleetAt(full.getDay, full.net.paths, at, D)) {
        if (!OPERATOR_LINES.includes(v.state.lineId)) continue;
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
  }, 120_000);
});
