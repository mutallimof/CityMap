import { poseOnLeg, type LinePath, type LngLat } from './path';
import { vesselsAt } from './state';
import type { LocalTime } from './time';
import type { DaySchedule, VesselState } from './types';

export interface VesselPose {
  state: VesselState;
  lngLat: LngLat;
  /** Raw path-tangent heading (compass degrees). Smoothing happens in the render layer. */
  bearing: number;
}

/**
 * Pose of every vessel in service at a local instant — pure: f(schedules, paths, time).
 * Docked vessels sit at the end of the leg they arrived on, facing their arrival heading
 * (or, before their first departure, the start of the leg they're about to sail).
 */
export function fleetAt(getDay: (day: number) => DaySchedule, paths: Map<string, LinePath>, at: LocalTime): VesselPose[] {
  const out: VesselPose[] = [];
  for (const s of vesselsAt(getDay, at)) {
    const path = paths.get(s.lineId);
    if (!path) continue;
    if (s.phase === 'underway') {
      const leg = path.legs[s.legIndex!];
      const pose = poseOnLeg(leg, s.distance, s.direction);
      out.push({ state: s, ...pose });
      continue;
    }
    // Docked at stop i — every case sits on stop vertex i; only the heading differs.
    const i = s.stopIndex!;
    const n = path.legs.length;
    const pose =
      s.direction === 'out'
        ? i === 0
          ? poseOnLeg(path.legs[0], 0, 'out') // waiting to depart outbound
          : poseOnLeg(path.legs[i - 1], path.legs[i - 1].length, 'out') // arrived outbound
        : i === n
          ? poseOnLeg(path.legs[n - 1], path.legs[n - 1].length, 'out') // turnaround at the terminus
          : poseOnLeg(path.legs[i], path.legs[i].length, 'back'); // arrived inbound
    out.push({ state: s, ...pose });
  }
  return out;
}
