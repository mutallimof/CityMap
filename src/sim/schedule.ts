import { CONFIG } from '../config';
import { kmhToMs, legProfile } from './motion';
import { originDepartures, type PeakWindows } from './timetable';
import type { DaySchedule, Departure, Direction, LineGeometry, LineSpec, Segment, Vessel } from './types';

export interface ScheduleParams {
  ramp: number;
  peakWindows: PeakWindows;
  spawnLeadS: number;
  retireAfterS: number;
  maxLayoverS: number;
}

export const DEFAULT_PARAMS: ScheduleParams = {
  ramp: CONFIG.sim.rampSeconds,
  peakWindows: CONFIG.sim.peakWindows,
  spawnLeadS: CONFIG.sim.spawnLeadMin * 60,
  retireAfterS: CONFIG.sim.retireAfterMin * 60,
  maxLayoverS: CONFIG.sim.maxLayoverMin * 60,
};

export interface LineInput {
  line: LineSpec;
  geometry: LineGeometry;
}

/**
 * One-way trip starting at time `t` from the direction's first stop.
 * Returns the segments (legs + intermediate dwells) and the departures it makes.
 */
function buildTrip(
  { line, geometry }: LineInput,
  direction: Direction,
  t: number,
  tripId: string,
  p: ScheduleParams,
): { segments: Segment[]; departures: Departure[]; arrival: number } {
  const n = geometry.legLengths.length;
  const legOrder = direction === 'out' ? [...Array(n).keys()] : [...Array(n).keys()].reverse();
  const cruise = kmhToMs(line.service.speedKmh);
  const dwell = line.service.dwellMin * 60;
  const lastStop = direction === 'out' ? line.stops[n] : line.stops[0];

  // First pass for timing, so every segment can carry the trip's [t0, t1].
  const durations = legOrder.map((i) => legProfile(geometry.legLengths[i], cruise, p.ramp).duration);
  const t1 = t + durations.reduce((a, b) => a + b, 0) + dwell * (n - 1);
  const trip = { id: tripId, t0: t, t1 };

  const segments: Segment[] = [];
  const departures: Departure[] = [];
  let now = t;
  legOrder.forEach((legIndex, k) => {
    const fromStop = direction === 'out' ? legIndex : legIndex + 1;
    departures.push({ lineId: line.id, tripId, stopId: line.stops[fromStop], direction, t: now, toStopId: lastStop });
    segments.push({ kind: 'leg', t0: now, t1: now + durations[k], legIndex, direction, length: geometry.legLengths[legIndex], cruise, ramp: p.ramp, trip });
    now += durations[k];
    if (k < n - 1) {
      const stopIndex = direction === 'out' ? legIndex + 1 : legIndex;
      segments.push({ kind: 'dock', t0: now, t1: now + dwell, stopIndex, direction, trip });
      now += dwell;
    }
  });
  return { segments, departures, arrival: now };
}

/**
 * All vessels for one line on one service day. Outbound trips leave the origin on the
 * timetable; each vessel turns around at the terminus after one dwell, sails back, and
 * is reused for the next origin departure it can make (min one dwell at the origin).
 * The most recently freed vessel is preferred, so surplus vessels stay idle; a vessel whose
 * layover would exceed `maxLayoverS` leaves service instead. New vessels appear docked at the
 * origin `spawnLeadS` before their first departure and retire docked `retireAfterS` after
 * their last arrival — vessels never teleport.
 */
export function buildLineDay(input: LineInput, day: number, p: ScheduleParams = DEFAULT_PARAMS): { vessels: Vessel[]; departures: Departure[] } {
  const { line, geometry } = input;
  if (geometry.legLengths.length !== line.stops.length - 1) {
    throw new Error(`${line.id}: ${line.stops.length} stops need ${line.stops.length - 1} legs, got ${geometry.legLengths.length}`);
  }
  const dwell = line.service.dwellMin * 60;
  const terminus = line.stops.length - 1;
  const vessels: (Vessel & { freeAt: number })[] = [];
  const departures: Departure[] = [];

  originDepartures(line.service, p.peakWindows).forEach((dep, k) => {
    let v = vessels
      .filter((x) => x.freeAt <= dep && dep - x.segments[x.segments.length - 1].t1 <= p.maxLayoverS)
      .sort((a, b) => b.freeAt - a.freeAt)[0];
    if (v) {
      const lastT = v.segments[v.segments.length - 1].t1;
      v.segments.push({ kind: 'dock', t0: lastT, t1: dep, stopIndex: 0, direction: 'out' });
    } else {
      v = { id: `${line.id}#${vessels.length + 1}`, lineId: line.id, segments: [], freeAt: 0 };
      vessels.push(v);
      v.segments.push({ kind: 'dock', t0: dep - p.spawnLeadS, t1: dep, stopIndex: 0, direction: 'out' });
    }
    const out = buildTrip(input, 'out', dep, `${line.id}:${day}:${k}:out`, p);
    const turnDep = out.arrival + dwell;
    const back = buildTrip(input, 'back', turnDep, `${line.id}:${day}:${k}:back`, p);
    v.segments.push(...out.segments, { kind: 'dock', t0: out.arrival, t1: turnDep, stopIndex: terminus, direction: 'back' }, ...back.segments);
    departures.push(...out.departures, ...back.departures);
    v.freeAt = back.arrival + dwell;
  });

  for (const v of vessels) {
    const lastT = v.segments[v.segments.length - 1].t1;
    v.segments.push({ kind: 'dock', t0: lastT, t1: lastT + p.retireAfterS, stopIndex: 0, direction: 'out' });
  }
  return { vessels: vessels.map(({ freeAt: _freeAt, ...v }) => v), departures };
}

export function buildDaySchedule(lines: LineInput[], day: number, p: ScheduleParams = DEFAULT_PARAMS): DaySchedule {
  const vessels: Vessel[] = [];
  const departures: Departure[] = [];
  for (const l of lines) {
    const r = buildLineDay(l, day, p);
    vessels.push(...r.vessels);
    departures.push(...r.departures);
  }
  departures.sort((a, b) => a.t - b.t);
  return { day, vessels, departures };
}
