import { distanceAt, legProfile, speedAt } from './motion';
import { DAY_S, type LocalTime } from './time';
import type { DaySchedule, Departure, Segment, Vessel, VesselState } from './types';

/** Index of the segment containing t (t0 ≤ t < t1), or -1. Segments are contiguous. */
export function findSegment(segments: Segment[], t: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  if (hi < 0 || t < segments[0].t0 || t >= segments[hi].t1) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segments[mid].t0 <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Vessel state at `t` seconds since its service day's midnight, or null if not in service. */
export function vesselStateAt(v: Vessel, t: number): VesselState | null {
  const i = findSegment(v.segments, t);
  if (i < 0) return null;
  const seg = v.segments[i];
  const first = v.segments[0].t0;
  const last = v.segments[v.segments.length - 1].t1;
  const base = {
    vesselId: v.id,
    lineId: v.lineId,
    direction: seg.direction,
    phaseElapsed: t - seg.t0,
    phaseRemaining: seg.t1 - t,
    serviceElapsed: t - first,
    serviceRemaining: last - t,
  };
  if (seg.kind === 'dock') {
    return {
      ...base,
      phase: 'docked',
      stopIndex: seg.stopIndex,
      distance: 0,
      legLength: 0,
      speed: 0,
      nextStopIndex: seg.stopIndex,
      eta: 0,
      tripProgress: seg.trip ? (t - seg.trip.t0) / (seg.trip.t1 - seg.trip.t0) : 0,
    };
  }
  const prof = legProfile(seg.length, seg.cruise, seg.ramp);
  const local = t - seg.t0;
  return {
    ...base,
    phase: 'underway',
    legIndex: seg.legIndex,
    distance: distanceAt(prof, local),
    legLength: seg.length,
    speed: speedAt(prof, local),
    nextStopIndex: seg.direction === 'out' ? seg.legIndex + 1 : seg.legIndex,
    eta: seg.t1 - t,
    tripProgress: (t - seg.trip.t0) / (seg.trip.t1 - seg.trip.t0),
  };
}

/**
 * All vessels in service at a local instant. Looks at today's and yesterday's schedules
 * because late trips run past midnight. `getDay` supplies (and may cache) schedules.
 */
export function vesselsAt(getDay: (day: number) => DaySchedule, at: LocalTime): VesselState[] {
  const out: VesselState[] = [];
  for (const [day, t] of [
    [at.day - 1, at.seconds + DAY_S],
    [at.day, at.seconds],
  ] as const) {
    for (const v of getDay(day).vessels) {
      const s = vesselStateAt(v, t);
      if (s) out.push(s);
    }
  }
  return out;
}

export interface UpcomingDeparture extends Departure {
  /** Seconds from `at` until departure. */
  inSeconds: number;
}

/** Next `n` departures from a stop after `at` (spanning midnight). */
export function nextDepartures(getDay: (day: number) => DaySchedule, stopId: string, at: LocalTime, n: number): UpcomingDeparture[] {
  const out: UpcomingDeparture[] = [];
  for (const day of [at.day - 1, at.day, at.day + 1]) {
    const offset = (day - at.day) * DAY_S;
    for (const d of getDay(day).departures) {
      const inSeconds = d.t + offset - at.seconds;
      if (d.stopId === stopId && inSeconds >= 0) out.push({ ...d, inSeconds });
    }
  }
  return out.sort((a, b) => a.inSeconds - b.inSeconds).slice(0, n);
}

/** Memoising wrapper so per-frame queries don't rebuild a day's schedule. */
export function cachedDays(build: (day: number) => DaySchedule, keep = 4): (day: number) => DaySchedule {
  const cache = new Map<number, DaySchedule>();
  return (day) => {
    let s = cache.get(day);
    if (!s) {
      s = build(day);
      cache.set(day, s);
      while (cache.size > keep) cache.delete(cache.keys().next().value as number);
    }
    return s;
  };
}
