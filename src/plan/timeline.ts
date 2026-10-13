/**
 * Plan timeline: stops in time order grouped by day, and between two consecutive stops — and from the
 * day's start point to the first stop, and from the last stop to its end point — only what's real: an
 * approximate walk when close enough and on the same landmass (land.ts), otherwise the actual ferry from the timetable (labelled when the
 * line is on its simulated schedule), otherwise "no transport info". Plus warnings: closed at the
 * planned time (known hours only), overlapping stops, arriving late, and dates outside the timetable.
 * No "last ferry" warning: we only know Şehir Hatları, and private operators often run later.
 * Pure: everything comes in through `PlanDeps`.
 */
import { CONFIG } from '../config';
import type { LineMode } from '../sim/schedule';
import type { DaySchedule, Departure } from '../sim/types';
import { isIslet } from './islets';
import { endOf, endsOf, planDays, sortedStops, startOf, stopMs, type Plan, type PlanPoint, type PlanStop } from './model';

type LngLat = [number, number];

export interface PlanDeps {
  place(id: string): { id?: string; name: string; nameEn?: string | null; lngLat: LngLat; hours?: string | null; osm?: string | null } | undefined;
  event(id: string): { title: string; start: string; place: string } | undefined;
  /** Open / closed / unknown at an instant from OSM opening hours. */
  openAt(hours: string | null | undefined, ms: number): { state: 'open' | 'closed' | 'unknown' };
  /** `operator`: a private operator's own pier (closest piers are counted per operator, see piersNear). */
  piers: { id: string; name: string; nameEn: string; lngLat: LngLat; operator?: string }[];
  /** Schedule of a service day (days since 1970-01-01, Istanbul). */
  getDay(day: number): DaySchedule & { modes: Record<string, LineMode> };
  /** Whether the real timetable covers a service day. */
  timetableValid(day: number): boolean;
  /**
   * Landmass of a point within `snapM` m of the coastline polygons, null = on none (`makeLandIndex` in
   * land.ts). Absent = no land data: walks are decided by distance only.
   */
  landOf?(p: LngLat, snapM: number): number | null;
}

export type Warning =
  | { kind: 'closed'; until?: string }
  | { kind: 'hoursUnknown' }
  | { kind: 'overlap'; with: string }
  | { kind: 'late'; arrive: number }
  | { kind: 'gone' }
  | { kind: 'outsideDates' };

export interface ResolvedStop {
  stop: PlanStop;
  n: number;
  name: string;
  nameEn: string;
  lngLat: LngLat | null;
  /** An islet (own boat only): no walk / ferry connection to or from it, "No transport info". */
  islet?: boolean;
  /** Epoch ms. */
  start: number;
  end: number;
  warnings: Warning[];
}

export interface FerryLeg {
  lineId: string;
  tripId: string;
  real: boolean;
  fromPier: string;
  toPier: string;
  /** Epoch ms. */
  dep: number;
  arr: number;
  walkToMin: number;
  walkFromMin: number;
  /** Pier ids the trip calls at from board to alight (for drawing). */
  via: string[];
}

export type Connection =
  | { mode: 'walk'; minutes: number; km: number }
  | ({ mode: 'ferry' } & FerryLeg)
  | { mode: 'none' };

export interface DayTimeline {
  day: string;
  stops: ResolvedStop[];
  /** connections[i] = from stops[i] to stops[i + 1]. */
  connections: Connection[];
  /** From the day's start point to its first stop (`leave` = epoch ms to set off; null without transport info). */
  start: { point: PlanPoint; conn: Connection; leave: number | null } | null;
  /** From the day's last stop to its end point. */
  end: { point: PlanPoint; conn: Connection } | null;
  /** The real timetable doesn't cover this day: ferries use the simulated schedule. */
  simulatedFerries: boolean;
}

const DAY_MS = 86_400_000;
const OFFSET_MS = 3 * 3_600_000;
const serviceDay = (ms: number) => Math.floor((ms + OFFSET_MS) / DAY_MS);
const dayStart = (d: number) => d * DAY_MS - OFFSET_MS;

/** Straight-line distance (m). */
function distanceM(a: LngLat, b: LngLat): number {
  const kx = 111_320 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110_574);
}

/** Approximate walk: straight line × CONFIG.plan.walk.factor at CONFIG.plan.walk.kmh. */
function walk(a: LngLat, b: LngLat): { km: number; minutes: number } {
  const km = (distanceM(a, b) * CONFIG.plan.walk.factor) / 1000;
  return { km, minutes: Math.max(1, Math.round((km / CONFIG.plan.walk.kmh) * 60)) };
}

/** Per schedule: every trip's calls with arrival / departure times (seconds of its service day). */
const tripIndex = new WeakMap<DaySchedule, Map<string, { lineId: string; real: boolean; calls: { stop: number; arr?: number }[] }>>();
function tripsOf(s: DaySchedule) {
  let idx = tripIndex.get(s);
  if (idx) return idx;
  idx = new Map();
  for (const v of s.vessels) {
    for (const seg of v.segments) {
      if (seg.kind !== 'leg') continue;
      let t = idx.get(seg.trip.id);
      if (!t) {
        t = { lineId: v.lineId, real: seg.trip.real, calls: [{ stop: seg.fromStop }] };
        idx.set(seg.trip.id, t);
      }
      t.calls.push({ stop: seg.toStop, arr: seg.t1 });
    }
  }
  tripIndex.set(s, idx);
  return idx;
}

/**
 * Landmass of a stop / point (undefined = no land data): the coastline within snapM; a point off it but on
 * one of our piers (the pier head over the water) takes that pier's landmass; anything else is on none.
 */
function massOf(deps: PlanDeps, p: LngLat): number | null | undefined {
  if (!deps.landOf) return undefined;
  const m = deps.landOf(p, CONFIG.plan.walk.snapM);
  if (m !== null) return m;
  let pier: LngLat | null = null;
  let best: number = CONFIG.plan.walk.snapM;
  for (const x of deps.piers) {
    const d = distanceM(p, x.lngLat);
    if (d <= best) {
      best = d;
      pier = x.lngLat;
    }
  }
  return pier ? deps.landOf(pier, CONFIG.plan.walk.pierSnapM) : null;
}

/** A walk between two landmasses (see massOf) doesn't cross water. */
const sameMass = (a: number | null | undefined, b: number | null | undefined) => a === undefined || (a !== null && a === b);

/**
 * Piers within walking distance of p, on its landmass: the closest `piersPerSide` of each operator's piers
 * (a private operator's pier next to a Şehir Hatları one never pushes that one out).
 */
function piersNear(deps: PlanDeps, p: LngLat, mass: number | null | undefined): { id: string; minutes: number }[] {
  const near = deps.piers
    .filter((x) => sameMass(mass, deps.landOf?.(x.lngLat, CONFIG.plan.walk.pierSnapM)))
    .map((x) => ({ id: x.id, op: x.operator ?? '', ...walk(p, x.lngLat) }))
    .filter((x) => x.km <= CONFIG.plan.walk.maxPierKm)
    .sort((a, b) => a.km - b.km);
  const taken = new Map<string, number>();
  return near
    .filter((x) => {
      const n = taken.get(x.op) ?? 0;
      taken.set(x.op, n + 1);
      return n < CONFIG.plan.walk.piersPerSide;
    })
    .map(({ id, minutes }) => ({ id, minutes }));
}

interface Ride {
  dep: Departure;
  depMs: number;
  arrMs: number;
  toPier: string;
  real: boolean;
  via: string[];
}

/**
 * Published departures from `fromPiers` between `fromMs` and `toMs` (epoch), on trips that later call
 * at one of `toPiers`, with the arrival there. Looks at the service days around the window (late trips
 * belong to the previous service day; holidays and Fri/Sat nights come from the schedules themselves).
 */
function rides(deps: PlanDeps, fromPiers: Set<string>, toPiers: Set<string>, fromMs: number, toMs: number, lineStops: (lineId: string) => string[]): Ride[] {
  const out: Ride[] = [];
  for (let d = serviceDay(fromMs) - 1; d <= serviceDay(toMs); d++) {
    const s = deps.getDay(d);
    const trips = tripsOf(s);
    for (const dep of s.departures) {
      const depMs = dayStart(d) + dep.t * 1000;
      if (depMs < fromMs || depMs > toMs || !fromPiers.has(dep.stopId)) continue;
      const trip = trips.get(dep.tripId);
      if (!trip) continue;
      const stops = lineStops(trip.lineId);
      const i = trip.calls.findIndex((c) => stops[c.stop] === dep.stopId);
      for (let j = i + 1; j < trip.calls.length; j++) {
        const pier = stops[trip.calls[j].stop];
        if (!toPiers.has(pier)) continue;
        out.push({ dep, depMs, arrMs: dayStart(d) + trip.calls[j].arr! * 1000, toPier: pier, real: dep.real, via: trip.calls.slice(i, j + 1).map((c) => stops[c.stop]) });
        break;
      }
    }
  }
  return out;
}

/** How to get from a (free at `readyMs`) to b: walk if close and on one landmass, else the first real ferry that gets there soonest. */
export function connect(deps: PlanDeps, a: LngLat, b: LngLat, readyMs: number, lineStops: (lineId: string) => string[]): Connection {
  const w = walk(a, b);
  const ma = massOf(deps, a);
  const mb = massOf(deps, b);
  if (w.km <= CONFIG.plan.walk.maxKm && sameMass(ma, mb)) return { mode: 'walk', minutes: w.minutes, km: w.km };
  const near = piersNear(deps, a, ma);
  const far = piersNear(deps, b, mb);
  if (!near.length || !far.length) return { mode: 'none' };
  const toWalk = new Map(near.map((p) => [p.id, p.minutes]));
  const fromWalk = new Map(far.map((p) => [p.id, p.minutes]));
  let best: (Ride & { atB: number }) | null = null;
  for (const r of rides(deps, new Set(toWalk.keys()), new Set(fromWalk.keys()), readyMs, readyMs + CONFIG.plan.walk.searchHours * 3_600_000, lineStops)) {
    if (r.depMs < readyMs + toWalk.get(r.dep.stopId)! * 60_000) continue; // can't reach the pier in time
    const atB = r.arrMs + fromWalk.get(r.toPier)! * 60_000;
    if (!best || atB < best.atB || (atB === best.atB && r.depMs < best.depMs)) best = { ...r, atB };
  }
  if (!best) return { mode: 'none' };
  return {
    mode: 'ferry',
    lineId: best.dep.lineId,
    tripId: best.dep.tripId,
    real: best.real,
    fromPier: best.dep.stopId,
    toPier: best.toPier,
    dep: best.depMs,
    arr: best.arrMs,
    walkToMin: toWalk.get(best.dep.stopId)!,
    walkFromMin: fromWalk.get(best.toPier)!,
    via: best.via,
  };
}

/**
 * How to get from a to b by `byMs` (the start point → the day's first stop): walk if close (one landmass), else the
 * ferry you can leave for latest and still arrive in time; if none does, the one that gets there soonest.
 */
function connectBy(deps: PlanDeps, a: LngLat, b: LngLat, byMs: number, lineStops: (lineId: string) => string[]): Connection {
  const w = walk(a, b);
  const ma = massOf(deps, a);
  const mb = massOf(deps, b);
  if (w.km <= CONFIG.plan.walk.maxKm && sameMass(ma, mb)) return { mode: 'walk', minutes: w.minutes, km: w.km };
  const near = piersNear(deps, a, ma);
  const far = piersNear(deps, b, mb);
  if (!near.length || !far.length) return { mode: 'none' };
  const toWalk = new Map(near.map((p) => [p.id, p.minutes]));
  const fromWalk = new Map(far.map((p) => [p.id, p.minutes]));
  let best: (Ride & { leave: number }) | null = null;
  for (const r of rides(deps, new Set(toWalk.keys()), new Set(fromWalk.keys()), byMs - CONFIG.plan.walk.searchHours * 3_600_000, byMs, lineStops)) {
    if (r.arrMs + fromWalk.get(r.toPier)! * 60_000 > byMs) continue;
    const leave = r.depMs - toWalk.get(r.dep.stopId)! * 60_000;
    if (!best || leave > best.leave || (leave === best.leave && r.arrMs < best.arrMs)) best = { ...r, leave };
  }
  if (!best) return connect(deps, a, b, byMs - CONFIG.plan.startEarlyMin * 60_000, lineStops);
  return { mode: 'ferry', lineId: best.dep.lineId, tripId: best.dep.tripId, real: best.real, fromPier: best.dep.stopId, toPier: best.toPier, dep: best.depMs, arr: best.arrMs, walkToMin: toWalk.get(best.dep.stopId)!, walkFromMin: fromWalk.get(best.toPier)!, via: best.via };
}

/** When to set off for a connection that must arrive by `byMs` (epoch ms), or null without transport info. */
function leaveFor(c: Connection, byMs: number): number | null {
  if (c.mode === 'walk') return byMs - c.minutes * 60_000;
  if (c.mode === 'ferry') return c.dep - c.walkToMin * 60_000;
  return null;
}

/** When a connection gets you to b (epoch ms), or null when there's no transport info. */
export function arrivalOf(c: Connection, readyMs: number): number | null {
  if (c.mode === 'walk') return readyMs + c.minutes * 60_000;
  if (c.mode === 'ferry') return c.arr + c.walkFromMin * 60_000;
  return null;
}

function resolve(deps: PlanDeps, s: PlanStop, n: number): ResolvedStop {
  const base = { stop: s, n, start: startOf(s), end: endOf(s), warnings: [] as Warning[] };
  if (s.kind === 'event') {
    const e = deps.event(s.ref);
    const p = e && deps.place(e.place);
    if (!e) return { ...base, name: s.label ?? s.ref, nameEn: s.label ?? s.ref, lngLat: null, warnings: [{ kind: 'gone' }] };
    // Events keep their real start even if the stored plan says otherwise (data refreshed).
    const start = Date.parse(e.start);
    return { ...base, start, end: start + s.dur * 60_000, name: e.title, nameEn: e.title, lngLat: p?.lngLat ?? null, ...(p && isIslet({ id: e.place, ...p }) ? { islet: true } : {}) };
  }
  const p = deps.place(s.ref) ?? (s.ll ? { name: s.label ?? s.ref, nameEn: s.label ?? s.ref, lngLat: s.ll, hours: null } : undefined);
  if (!p) return { ...base, name: s.label ?? s.ref, nameEn: s.label ?? s.ref, lngLat: null, warnings: [{ kind: 'gone' }] };
  const r: ResolvedStop = { ...base, name: p.name, nameEn: p.nameEn ?? p.name, lngLat: p.lngLat };
  if (isIslet({ id: s.ref, ...p })) r.islet = true;
  if (!p.hours) r.warnings.push({ kind: 'hoursUnknown' });
  else {
    const atStart = deps.openAt(p.hours, r.start).state;
    if (atStart === 'unknown') r.warnings.push({ kind: 'hoursUnknown' });
    else if (atStart === 'closed') r.warnings.push({ kind: 'closed' });
    else {
      // Open on arrival but closing before the planned end: say when.
      for (let t = r.start + 15 * 60_000; t < r.end; t += 15 * 60_000) {
        if (deps.openAt(p.hours, t).state === 'closed') {
          let c = t - 14 * 60_000; // the exact closing minute within the last step
          while (c < t && deps.openAt(p.hours, c).state !== 'closed') c += 60_000;
          r.warnings.push({ kind: 'closed', until: hhmm(c) });
          break;
        }
      }
    }
  }
  return r;
}

/** The whole plan as a timeline, grouped by day. */
export function buildTimeline(plan: Plan, deps: PlanDeps, lineStops: (lineId: string) => string[]): DayTimeline[] {
  const resolved = sortedStops(plan).map((s, i) => resolve(deps, s, i + 1));
  const days = [...new Set([...planDays(plan), ...resolved.map((r) => r.stop.day)])].sort();
  return days.map((day) => {
    const stops = resolved.filter((r) => r.stop.day === day).sort((a, b) => a.start - b.start || a.n - b.n);
    if (day < plan.from || day > plan.to) for (const s of stops) s.warnings.push({ kind: 'outsideDates' });
    const connections: Connection[] = [];
    for (let i = 0; i + 1 < stops.length; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (b.start < a.end) b.warnings.push({ kind: 'overlap', with: a.name });
      if (!a.lngLat || !b.lngLat || a.islet || b.islet) {
        connections.push({ mode: 'none' });
        continue;
      }
      const c = connect(deps, a.lngLat, b.lngLat, a.end, lineStops);
      connections.push(c);
      const at = arrivalOf(c, a.end);
      if (at !== null && at > b.start + CONFIG.plan.lateToleranceMin * 60_000 && b.start >= a.end) b.warnings.push({ kind: 'late', arrive: at });
    }
    // The day's start and end points (only around real stops).
    const ends = endsOf(plan, day);
    let start: DayTimeline['start'] = null;
    let end: DayTimeline['end'] = null;
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (ends.start && first) {
      const conn = first.lngLat && !first.islet ? connectBy(deps, ends.start.ll, first.lngLat, first.start, lineStops) : ({ mode: 'none' } as const);
      start = { point: ends.start, conn, leave: leaveFor(conn, first.start) };
      const at = conn.mode === 'ferry' ? arrivalOf(conn, first.start) : null; // a walk is timed to arrive on time
      if (at !== null && at > first.start + CONFIG.plan.lateToleranceMin * 60_000) first.warnings.push({ kind: 'late', arrive: at });
    }
    if (ends.end && last) end = { point: ends.end, conn: last.lngLat && !last.islet ? connect(deps, last.lngLat, ends.end.ll, last.end, lineStops) : { mode: 'none' } };
    const sd = serviceDay(stopMs(day, 12 * 60));
    return { day, stops, connections, start, end, simulatedFerries: !deps.timetableValid(sd) };
  });
}

/** Istanbul "HH:MM" of an epoch ms. */
export const hhmm = (ms: number) => new Date(ms + OFFSET_MS).toISOString().slice(11, 16);
