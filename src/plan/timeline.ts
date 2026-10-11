/**
 * Plan timeline: stops in time order grouped by day, and between two consecutive stops only what's
 * real — an approximate walk when close enough, otherwise the actual ferry from the timetable
 * (labelled when the line is on its simulated schedule), otherwise "no transport info". Plus warnings:
 * closed at the planned time (known hours only), overlapping stops, arriving late, the last ferry back,
 * and dates outside the timetable. Pure: everything comes in through `PlanDeps`.
 */
import { CONFIG } from '../config';
import type { LineMode } from '../sim/schedule';
import type { DaySchedule, Departure } from '../sim/types';
import { endOf, isoDay, planDays, sortedStops, startOf, stopMs, type Plan, type PlanStop } from './model';

type LngLat = [number, number];

export interface PlanDeps {
  place(id: string): { name: string; nameEn?: string | null; lngLat: LngLat; hours?: string | null } | undefined;
  event(id: string): { title: string; start: string; place: string } | undefined;
  /** Open / closed / unknown at an instant from OSM opening hours. */
  openAt(hours: string | null | undefined, ms: number): { state: 'open' | 'closed' | 'unknown' };
  piers: { id: string; name: string; nameEn: string; lngLat: LngLat }[];
  /** Schedule of a service day (days since 1970-01-01, Istanbul). */
  getDay(day: number): DaySchedule & { modes: Record<string, LineMode> };
  /** Whether the real timetable covers a service day. */
  timetableValid(day: number): boolean;
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

export interface LastFerry {
  toPier: string;
  /** Epoch ms of the last departure that still gets there. */
  dep: number;
  real: boolean;
  /** The plan's last stop ends too late for it. */
  missed: boolean;
}

export interface DayTimeline {
  day: string;
  stops: ResolvedStop[];
  /** connections[i] = from stops[i] to stops[i + 1]. */
  connections: Connection[];
  lastFerry: LastFerry | null;
  /** The real timetable doesn't cover this day: ferries use the simulated schedule. */
  simulatedFerries: boolean;
}

const DAY_MS = 86_400_000;
const OFFSET_MS = 3 * 3_600_000;
const serviceDay = (ms: number) => Math.floor((ms + OFFSET_MS) / DAY_MS);
const dayStart = (d: number) => d * DAY_MS - OFFSET_MS;

/** Straight-line distance (m). */
export function distanceM(a: LngLat, b: LngLat): number {
  const kx = 111_320 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110_574);
}

/** Approximate walk: straight line × CONFIG.plan.walk.factor at CONFIG.plan.walk.kmh. */
export function walk(a: LngLat, b: LngLat): { km: number; minutes: number } {
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

function piersNear(deps: PlanDeps, p: LngLat): { id: string; minutes: number }[] {
  return deps.piers
    .map((x) => ({ id: x.id, ...walk(p, x.lngLat) }))
    .filter((x) => x.km <= CONFIG.plan.walk.maxPierKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, CONFIG.plan.walk.piersPerSide)
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

/** How to get from a (free at `readyMs`) to b: walk if close, else the first real ferry that gets there soonest. */
export function connect(deps: PlanDeps, a: LngLat, b: LngLat, readyMs: number, lineStops: (lineId: string) => string[]): Connection {
  const w = walk(a, b);
  if (w.km <= CONFIG.plan.walk.maxKm) return { mode: 'walk', minutes: w.minutes, km: w.km };
  const near = piersNear(deps, a);
  const far = piersNear(deps, b);
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

/** When a connection gets you to b (epoch ms), or null when there's no transport info. */
export function arrivalOf(c: Connection, readyMs: number): number | null {
  if (c.mode === 'walk') return readyMs + c.minutes * 60_000;
  if (c.mode === 'ferry') return c.arr + c.walkFromMin * 60_000;
  return null;
}

/**
 * The last ferry from near the day's last stop back towards its first stop (when they're too far apart
 * to walk): the latest published departure on that service day (incl. after midnight) that gets there.
 */
export function lastFerryBack(deps: PlanDeps, last: ResolvedStop, first: ResolvedStop, lineStops: (lineId: string) => string[]): LastFerry | null {
  if (!last.lngLat || !first.lngLat || walk(last.lngLat, first.lngLat).km <= CONFIG.plan.walk.maxKm) return null;
  const near = piersNear(deps, last.lngLat);
  const home = piersNear(deps, first.lngLat);
  if (!near.length || !home.length) return null;
  const toWalk = new Map(near.map((p) => [p.id, p.minutes]));
  const d = serviceDay(last.start - 4 * 3_600_000); // the evening's service day (after-midnight stops belong to it)
  const list = rides(deps, new Set(toWalk.keys()), new Set(home.map((p) => p.id)), dayStart(d) + 4 * 3_600_000, dayStart(d + 1) + 6 * 3_600_000, lineStops);
  if (!list.length) return null;
  const lastRide = list.reduce((a, b) => (b.depMs > a.depMs ? b : a));
  const missed = last.end + toWalk.get(lastRide.dep.stopId)! * 60_000 > lastRide.depMs;
  return { toPier: lastRide.toPier, dep: lastRide.depMs, real: lastRide.real, missed };
}

function resolve(deps: PlanDeps, s: PlanStop, n: number): ResolvedStop {
  const base = { stop: s, n, start: startOf(s), end: endOf(s), warnings: [] as Warning[] };
  if (s.kind === 'event') {
    const e = deps.event(s.ref);
    const p = e && deps.place(e.place);
    if (!e) return { ...base, name: s.label ?? s.ref, nameEn: s.label ?? s.ref, lngLat: null, warnings: [{ kind: 'gone' }] };
    // Events keep their real start even if the stored plan says otherwise (data refreshed).
    const start = Date.parse(e.start);
    return { ...base, start, end: start + s.dur * 60_000, name: e.title, nameEn: e.title, lngLat: p?.lngLat ?? null };
  }
  const p = deps.place(s.ref) ?? (s.ll ? { name: s.label ?? s.ref, nameEn: s.label ?? s.ref, lngLat: s.ll, hours: null } : undefined);
  if (!p) return { ...base, name: s.label ?? s.ref, nameEn: s.label ?? s.ref, lngLat: null, warnings: [{ kind: 'gone' }] };
  const r: ResolvedStop = { ...base, name: p.name, nameEn: p.nameEn ?? p.name, lngLat: p.lngLat };
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
      if (!a.lngLat || !b.lngLat) {
        connections.push({ mode: 'none' });
        continue;
      }
      const c = connect(deps, a.lngLat, b.lngLat, a.end, lineStops);
      connections.push(c);
      const at = arrivalOf(c, a.end);
      if (at !== null && at > b.start + CONFIG.plan.lateToleranceMin * 60_000 && b.start >= a.end) b.warnings.push({ kind: 'late', arrive: at });
    }
    const sd = serviceDay(stopMs(day, 12 * 60));
    const lastFerry = stops.length >= 2 ? lastFerryBack(deps, stops[stops.length - 1], stops[0], lineStops) : null;
    return { day, stops, connections, lastFerry, simulatedFerries: !deps.timetableValid(sd) };
  });
}

/** Istanbul "HH:MM" of an epoch ms. */
export const hhmm = (ms: number) => new Date(ms + OFFSET_MS).toISOString().slice(11, 16);
export { isoDay };
