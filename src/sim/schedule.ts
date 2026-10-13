/**
 * Pure schedule building: planned trips → timed legs (`buildTrip`) → vessels (`assignVessels`); simulated
 * trips for lines without a valid timetable. Times are seconds since the service day's midnight.
 */
import { CONFIG } from '../config';
import { kmhToMs, legProfile } from './motion';
import { originDepartures, type PeakWindows } from './timetable';
import type { DaySchedule, Departure, LegRef, LegSpec, LineSpec, Segment, TripRef, Vessel } from './types';

export interface ScheduleParams {
  ramp: number;
  peakWindows: PeakWindows;
  spawnLeadS: number;
  retireAfterS: number;
  /** A vessel idle at a pier longer than this leaves service instead of waiting (simulated / timetabled lines). */
  maxLayoverS: number;
  maxLayoverRealS: number;
  /** Shortest turnaround at a pier between two trips of one vessel. */
  minTurnS: number;
  /** Shortest stop at an intermediate pier. */
  minDwellS: number;
  /** Plausible cruise speeds (m/s) when fitting a leg to printed times. */
  minCruise: number;
  maxCruise: number;
}

export const DEFAULT_PARAMS: ScheduleParams = {
  ramp: CONFIG.sim.rampSeconds,
  peakWindows: CONFIG.sim.peakWindows,
  spawnLeadS: CONFIG.sim.spawnLeadMin * 60,
  retireAfterS: CONFIG.sim.retireAfterMin * 60,
  maxLayoverS: CONFIG.sim.maxLayoverMin * 60,
  maxLayoverRealS: CONFIG.timetable.maxLayoverMin * 60,
  minTurnS: CONFIG.timetable.minTurnMin * 60,
  minDwellS: CONFIG.timetable.minDwellS,
  minCruise: kmhToMs(CONFIG.timetable.minCruiseKmh),
  maxCruise: kmhToMs(CONFIG.timetable.maxCruiseKmh),
};

export interface LineInput {
  line: LineSpec;
  /** Every leg the line can sail (pattern legs + any extra legs its timetable needs). */
  legs: LegSpec[];
}

/** One call of a planned trip. Times are seconds since the service day's midnight. */
export interface PlannedCall {
  stop: number;
  /** Departure (printed, or computed for simulated trips). */
  dep?: number;
  /** Arrival, when printed. */
  arr?: number;
  /** A time printed under "departure" at the trip's last stop: the vessel is at the pier by then. */
  atPier?: number;
  /** false: calls without taking passengers (not listed as a departure). */
  board?: boolean;
  mark?: string;
  pier?: 'old' | 'new';
}

export interface PlannedTrip {
  id: string;
  calls: PlannedCall[];
  real: boolean;
  /** The source prints the destinations, not the order of calls (private operators' merged sailings). */
  orderInferred?: boolean;
}

/**
 * The leg between two stops and the way it's sailed, or null if the line has none. A lane drawn in
 * this direction (from → to) wins; otherwise the opposite lane is sailed backwards.
 */
export function findLeg(legs: LegSpec[], from: number, to: number): (LegRef & { length: number }) | null {
  for (let i = 0; i < legs.length; i++) if (legs[i].from === from && legs[i].to === to) return { leg: i, dir: 'out', length: legs[i].length };
  for (let i = 0; i < legs.length; i++) if (legs[i].from === to && legs[i].to === from) return { leg: i, dir: 'back', length: legs[i].length };
  return null;
}

export interface BuiltTrip {
  ref: TripRef;
  first: number;
  last: number;
  firstLeg: LegRef;
  lastLeg: LegRef;
  segments: Segment[];
  departures: Departure[];
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/**
 * Segments for one trip. Printed times are kept exactly: a leg ends so the vessel is at the next
 * pier one dwell before its printed departure (shorter dwell when time is tight); a printed arrival
 * is met exactly. Times the source doesn't print come from the line's cruise speed. The cruise speed
 * of each leg is fitted to that time, within plausible limits (a slack timetable → a longer stop).
 */
export function buildTrip({ line, legs }: LineInput, trip: PlannedTrip, p: ScheduleParams = DEFAULT_PARAMS): BuiltTrip {
  const calls = trip.calls;
  if (calls.length < 2 || calls[0].dep === undefined) throw new Error(`${trip.id}: needs ≥ 2 calls and a first departure`);
  const lineCruise = kmhToMs(line.service.speedKmh);
  const dwell = line.service.dwellMin * 60;
  const t0 = calls[0].dep;
  const ref: TripRef = { id: trip.id, t0, t1: t0, stops: calls.map((c) => c.stop), real: trip.real, ...(trip.orderInferred ? { orderInferred: true as const } : {}) };
  const segments: Segment[] = [];
  const departures: Departure[] = [];
  const toStopId = line.stops[calls[calls.length - 1].stop];
  let t = t0;
  let firstLeg: LegRef | null = null;
  let prevLeg: LegRef | null = null;
  for (let i = 0; i < calls.length - 1; i++) {
    const a = calls[i];
    const b = calls[i + 1];
    const leg = findLeg(legs, a.stop, b.stop);
    if (!leg) throw new Error(`${trip.id}: ${line.id} has no leg ${line.stops[a.stop]} → ${line.stops[b.stop]}`);
    if (a.board !== false && (!trip.real || a.dep !== undefined)) {
      departures.push({
        lineId: line.id,
        tripId: trip.id,
        stopId: line.stops[a.stop],
        t,
        toStopId,
        real: trip.real,
        ...(a.mark ? { mark: a.mark } : {}),
        ...(a.pier ? { pier: a.pier } : {}),
        ...(trip.orderInferred ? { via: calls.slice(i + 1, -1).map((c) => line.stops[c.stop]) } : {}),
      });
    }
    const natural = legProfile(leg.length, lineCruise, p.ramp).duration;
    const next = b.dep ?? b.atPier;
    let D = natural;
    if (b.arr !== undefined) D = b.arr - t;
    else if (next !== undefined) {
      const gap = next - t;
      D = gap - clamp(gap - natural, p.minDwellS, dwell);
    }
    D = Math.max(D, 2 * p.ramp);
    let cruise = leg.length / (D - p.ramp);
    if (cruise < p.minCruise) {
      cruise = lineCruise; // timetable slack: sail normally, wait longer at the pier
      D = natural;
    } else if (cruise > p.maxCruise) {
      cruise = p.maxCruise; // can't make it (validator rejects such data): arrive late, never teleport
      D = legProfile(leg.length, cruise, p.ramp).duration;
    }
    const legRef: LegRef = { leg: leg.leg, dir: leg.dir };
    firstLeg ??= legRef;
    segments.push({ kind: 'leg', t0: t, t1: t + D, legIndex: leg.leg, dir: leg.dir, fromStop: a.stop, toStop: b.stop, length: leg.length, cruise, ramp: p.ramp, trip: ref });
    t += D;
    if (i < calls.length - 2) {
      const depart = findLeg(legs, b.stop, calls[i + 2].stop);
      if (!depart) throw new Error(`${trip.id}: ${line.id} has no leg from ${line.stops[b.stop]}`);
      const leave = Math.max(b.dep ?? t + dwell, t + p.minDwellS / 2);
      segments.push({ kind: 'dock', t0: t, t1: leave, stopIndex: b.stop, arrive: legRef, depart: { leg: depart.leg, dir: depart.dir }, trip: ref });
      t = leave;
    }
    prevLeg = legRef;
  }
  ref.t1 = t;
  return { ref, first: calls[0].stop, last: calls[calls.length - 1].stop, firstLeg: firstLeg!, lastLeg: prevLeg!, segments, departures };
}

/**
 * Chains trips into vessels: a trip is sailed by a vessel docked at its first pier (free at least
 * `minTurnS` before), preferring the most recently arrived one so surplus vessels stay idle; a vessel
 * idle longer than `maxLayover` leaves service instead. New vessels appear docked `spawnLeadS` before
 * their first departure and retire docked `retireAfterS` after their last arrival — never teleporting.
 * Ids carry the service day, so yesterday's late vessels never collide with today's.
 */
function assignVessels(lineId: string, trips: BuiltTrip[], maxLayover: number, p: ScheduleParams = DEFAULT_PARAMS, day = 0): Vessel[] {
  const vessels: (Vessel & { at: number; lastT: number; lastLeg: LegRef | null })[] = [];
  for (const b of [...trips].sort((x, y) => x.ref.t0 - y.ref.t0 || (x.ref.id < y.ref.id ? -1 : 1))) {
    const d = b.ref.t0;
    let v = vessels
      .filter((x) => x.at === b.first && x.lastT + p.minTurnS <= d && d - x.lastT <= maxLayover)
      .sort((x, y) => y.lastT - x.lastT)[0];
    if (v) {
      v.segments.push({ kind: 'dock', t0: v.lastT, t1: d, stopIndex: b.first, arrive: v.lastLeg, depart: b.firstLeg, trip: b.ref });
    } else {
      v = { id: `${lineId}#${vessels.length + 1}@${day}`, lineId, segments: [], at: b.first, lastT: d, lastLeg: null };
      vessels.push(v);
      v.segments.push({ kind: 'dock', t0: d - p.spawnLeadS, t1: d, stopIndex: b.first, arrive: null, depart: b.firstLeg, trip: b.ref });
    }
    v.segments.push(...b.segments);
    v.at = b.last;
    v.lastT = b.ref.t1;
    v.lastLeg = b.lastLeg;
  }
  return vessels.map(({ id, lineId: l, segments, at, lastT, lastLeg }) => ({
    id,
    lineId: l,
    segments: [...segments, { kind: 'dock' as const, t0: lastT, t1: lastT + p.retireAfterS, stopIndex: at, arrive: lastLeg, depart: null }],
  }));
}

/** Simulated trips: outbound along the pattern on the headway timetable, back after one dwell at the terminus. */
function simulatedTrips(input: LineInput, day: number, p: ScheduleParams = DEFAULT_PARAMS): BuiltTrip[] {
  const { line } = input;
  const idx = line.pattern.map((s) => line.stops.indexOf(s));
  if (idx.length < 2 || idx.some((i) => i < 0)) throw new Error(`${line.id}: bad pattern`);
  const dwell = line.service.dwellMin * 60;
  const out: BuiltTrip[] = [];
  originDepartures(line.service, p.peakWindows).forEach((dep, k) => {
    const go = buildTrip(input, { id: `${line.id}:${day}:${k}:out`, real: false, calls: [{ stop: idx[0], dep }, ...idx.slice(1).map((stop) => ({ stop }))] }, p);
    const back = [...idx].reverse();
    const ret = buildTrip(input, { id: `${line.id}:${day}:${k}:back`, real: false, calls: [{ stop: back[0], dep: go.ref.t1 + dwell }, ...back.slice(1).map((stop) => ({ stop }))] }, p);
    out.push(go, ret);
  });
  return out;
}

export type LineMode = 'real' | 'sim';

/** Real trips for a line on a service day, or null → simulate. */
export type RealTrips = (line: LineSpec, day: number) => PlannedTrip[] | null;

/** All vessels + departures for one line on one service day. */
export function buildLineDay(input: LineInput, day: number, p: ScheduleParams = DEFAULT_PARAMS, real?: RealTrips): { vessels: Vessel[]; departures: Departure[]; mode: LineMode } {
  const planned = real?.(input.line, day);
  if (planned) {
    const built = planned.map((t) => buildTrip(input, t, p));
    return { vessels: assignVessels(input.line.id, built, p.maxLayoverRealS, p, day), departures: built.flatMap((b) => b.departures), mode: 'real' };
  }
  const built = simulatedTrips(input, day, p);
  return { vessels: assignVessels(input.line.id, built, p.maxLayoverS, p, day), departures: built.flatMap((b) => b.departures), mode: 'sim' };
}

export function buildDaySchedule(lines: LineInput[], day: number, p: ScheduleParams = DEFAULT_PARAMS, real?: RealTrips): DaySchedule & { modes: Record<string, LineMode> } {
  const vessels: Vessel[] = [];
  const departures: Departure[] = [];
  const modes: Record<string, LineMode> = {};
  for (const l of lines) {
    const r = buildLineDay(l, day, p, real);
    vessels.push(...r.vessels);
    departures.push(...r.departures);
    modes[l.line.id] = r.mode;
  }
  departures.sort((a, b) => a.t - b.t);
  return { day, vessels, departures, modes };
}
