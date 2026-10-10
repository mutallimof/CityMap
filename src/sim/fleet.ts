import { poseOnLeg, type LinePath, type LngLat, type Pose, type StopBerth } from './path';
import { vesselStateAt } from './state';
import { DAY_S, type LocalTime } from './time';
import type { DaySchedule, Vessel, VesselState } from './types';

export interface DockingParams {
  /** Sim seconds to turn alongside after arriving, and to turn out before departing. */
  turnSeconds: number;
  /** Route distance (m) over which a vessel blends into / out of its berth slot. */
  berthBlendM: number;
}

export interface VesselPose {
  state: VesselState;
  /** The vessel and its service-day time, so effects (wake) can sample past poses. */
  vessel: Vessel;
  t: number;
  lngLat: LngLat;
  /** Heading (compass degrees): path tangent underway, docking turn when docked. */
  bearing: number;
  /**
   * Berth the vessel is at or near, with weight 0..1 (1 = docked). The render layer uses it to
   * offset shared-berth slots and push exaggerated hulls off the quay; weight fades with distance.
   */
  berth?: StopBerth & { weight: number };
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Interpolate compass angles the short way round. */
export function lerpAngle(a: number, b: number, t: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

/** The coast-parallel heading (along or along+180) nearest to `h`. */
function alongNearest(along: number, h: number): number {
  const d = Math.abs(((((h - along) % 360) + 540) % 360) - 180);
  return d <= 90 ? along : (along + 180) % 360;
}

/** Heading of a docked vessel: arrival → alongside → departure, as a pure function of dock time. */
export function dockedHeading(arrival: number | null, departure: number | null, along: number | null, elapsed: number, remaining: number, turnS: number): number {
  const ref = arrival ?? departure ?? along ?? 0;
  const side = along === null ? ref : alongNearest(along, ref);
  const arr = arrival ?? side;
  const dep = departure ?? side;
  // Split the dock time if it's too short for two full turns.
  const t = Math.min(turnS, (elapsed + remaining) / 2);
  if (elapsed < t) return lerpAngle(arr, side, smooth(elapsed / t));
  if (remaining < t) return lerpAngle(side, dep, smooth(1 - remaining / t));
  return side;
}

/** Arrival and departure poses for a docked vessel at stop i (null when there is none). */
function dockPoses(s: VesselState, path: LinePath): { at: Pose; arrival: Pose | null; departure: Pose | null } {
  const i = s.stopIndex!;
  const legs = path.legs;
  const n = legs.length;
  const first = s.phaseElapsed === s.serviceElapsed; // spawn dock: never arrived
  const last = s.phaseRemaining === s.serviceRemaining; // retire dock: never departs
  let arrival: Pose | null;
  let departure: Pose | null;
  if (s.direction === 'out') {
    arrival = i === 0 ? (first ? null : poseOnLeg(legs[0], legs[0].length, 'back')) : poseOnLeg(legs[i - 1], legs[i - 1].length, 'out');
    departure = i < n ? poseOnLeg(legs[i], 0, 'out') : null;
  } else {
    arrival = i === n ? poseOnLeg(legs[n - 1], legs[n - 1].length, 'out') : poseOnLeg(legs[i], legs[i].length, 'back');
    departure = i > 0 ? poseOnLeg(legs[i - 1], 0, 'back') : null;
  }
  if (last) departure = null;
  const at = arrival ?? departure ?? poseOnLeg(legs[Math.min(i, n - 1)], i === n ? legs[n - 1].length : 0, 'out');
  return { at, arrival, departure };
}

/** Pose of one vessel at `t` seconds of its service day, or null if not in service. Pure. */
export function vesselPose(v: Vessel, path: LinePath, t: number, p: DockingParams): VesselPose | null {
  const s = vesselStateAt(v, t);
  if (!s) return null;
  if (s.phase === 'underway') {
    const leg = path.legs[s.legIndex!];
    const pose = poseOnLeg(leg, s.distance, s.direction);
    // Near either end of the leg, blend toward that end's berth.
    const fromStop = s.direction === 'out' ? s.legIndex! : s.legIndex! + 1;
    const toEnd = s.legLength - s.distance;
    const near = s.distance < toEnd ? { stop: fromStop, d: s.distance } : { stop: s.nextStopIndex, d: toEnd };
    const b = path.berths?.[near.stop];
    return { state: s, vessel: v, t, ...pose, berth: b && { ...b, weight: 1 - smooth(near.d / p.berthBlendM) } };
  }
  const { at: pose, arrival, departure } = dockPoses(s, path);
  const b = path.berths?.[s.stopIndex!];
  const bearing = dockedHeading(arrival?.bearing ?? null, departure?.bearing ?? null, b?.along ?? null, s.phaseElapsed, s.phaseRemaining, p.turnSeconds);
  return { state: s, vessel: v, t, lngLat: pose.lngLat, bearing, berth: b && { ...b, weight: 1 } };
}

/**
 * Pose of every vessel in service at a local instant — pure: f(schedules, paths, time).
 * Looks at yesterday's schedule too (late trips run past midnight).
 * Docked vessels sit on their stop vertex and turn alongside the pier, then out again.
 */
export function fleetAt(getDay: (day: number) => DaySchedule, paths: Map<string, LinePath>, at: LocalTime, p: DockingParams): VesselPose[] {
  const out: VesselPose[] = [];
  for (const [day, t] of [
    [at.day - 1, at.seconds + DAY_S],
    [at.day, at.seconds],
  ] as const) {
    for (const v of getDay(day).vessels) {
      const path = paths.get(v.lineId);
      const pose = path && vesselPose(v, path, t, p);
      if (pose) out.push(pose);
    }
  }
  return out;
}
