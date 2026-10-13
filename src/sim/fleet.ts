/**
 * Pure vessel poses at a time: sailing along the route leg, docking turns, berth slots side by side and
 * slides along the quay past moored neighbours. Visual-only effects never change where a vessel is.
 */
import { daySlots, type DockInfo } from './berths';
import { poseOnLeg, type LinePath, type LngLat, type Pose, type StopBerth } from './path';
import { findSegment, vesselStateAt } from './state';
import { DAY_S, type LocalTime } from './time';
import type { DaySchedule, Segment, Vessel, VesselState } from './types';

export interface DockingParams {
  /** Sim seconds to turn alongside after arriving, and to turn out before departing. */
  turnSeconds: number;
  /** Route distance (m) over which a vessel blends into / out of its berth slot. */
  berthBlendM: number;
  /** Sim seconds a berth slot stays reserved before arrival and after departure. */
  slotPadS?: number;
  /** A turn that can't be done on the spot (neighbour moored alongside) is sailed over this route distance (m). */
  tightTurnM?: number;
  /**
   * Drawn hull length (m, incl. zoom exaggeration). With it, a vessel that leaves (or reaches) a berth slot
   * while another is moored outside it first slides along the quay past that hull, then swings out (in).
   */
  hullM?: number;
}

export interface VesselPose {
  state: VesselState;
  /** The vessel and its service-day time, so effects (wake) can sample past poses. */
  vessel: Vessel;
  t: number;
  lngLat: LngLat;
  /** Heading (compass degrees): path tangent underway, docking turn when docked. */
  bearing: number;
  /** Service day the vessel's schedule belongs to (for re-sampling its poses with the same berth info). */
  day?: number;
  /**
   * Berth the vessel is at or near, with weight 0..1 (1 = docked). The render layer uses it to
   * moor vessels abreast (slot) and push exaggerated hulls off the quay; weight fades with distance.
   */
  berth?: StopBerth & { weight: number };
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Route distance (m) over which a blocked vessel slides along the quay and swings out / in. */
const slideM = (hullM: number) => hullM * 2.6 + 80;

/** A lng/lat moved by (east, north) metres (local flat approximation; fine for a few hundred metres). */
function offsetLngLat([lng, lat]: LngLat, east: number, north: number): LngLat {
  return [lng + east / (111_320 * Math.cos((lat * Math.PI) / 180)), lat + north / 110_574];
}
const lerpLngLat = (a: LngLat, b: LngLat, t: number): LngLat => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Signed angle difference in [-180, 180). */
const wrap = (d: number) => ((((d % 360) + 540) % 360) - 180);

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

/**
 * Heading of a docked vessel: arrival → alongside → departure, as a pure function of dock time.
 * A tight turn (another vessel alongside) isn't done on the spot: the vessel already lies alongside
 * on arrival / stays alongside until it leaves, and turns while sailing (see vesselPose).
 */
export function dockedHeading(arrival: number | null, departure: number | null, along: number | null, elapsed: number, remaining: number, turnS: number, tight?: { in: boolean; out: boolean }): number {
  const side = sideOf(arrival, departure, along);
  const arr = tight?.in ? side : (arrival ?? side);
  const dep = tight?.out ? side : (departure ?? side);
  // Split the dock time if it's too short for two full turns.
  const t = Math.min(turnS, (elapsed + remaining) / 2);
  if (elapsed < t) return lerpAngle(arr, side, smooth(elapsed / t));
  if (remaining < t) return lerpAngle(side, dep, smooth(1 - remaining / t));
  return side;
}

/** Alongside heading of a stay: the coast-parallel direction nearest the way it came in (or leaves). */
function sideOf(arrival: number | null, departure: number | null, along: number | null): number {
  const ref = arrival ?? departure ?? along ?? 0;
  return along === null ? ref : alongNearest(along, ref);
}

type Dock = Extract<Segment, { kind: 'dock' }>;

/** Arrival and departure poses of a dock stay (null when it appears / retires here). */
function dockPoses(d: Pick<Dock, 'arrive' | 'depart' | 'stopIndex'>, path: LinePath): { at: Pose; arrival: Pose | null; departure: Pose | null } {
  const legs = path.legs;
  const arrival = d.arrive ? poseOnLeg(legs[d.arrive.leg], legs[d.arrive.leg].length, d.arrive.dir) : null;
  const departure = d.depart ? poseOnLeg(legs[d.depart.leg], 0, d.depart.dir) : null;
  const at = arrival ?? departure ?? { lngLat: path.stopPoint[d.stopIndex], bearing: 0 };
  return { at, arrival, departure };
}

const dockSide = (d: Dock, path: LinePath) => {
  const { arrival, departure } = dockPoses(d, path);
  return sideOf(arrival?.bearing ?? null, departure?.bearing ?? null, path.berths?.[d.stopIndex]?.along ?? null);
};

/**
 * Pose of one vessel at `t` seconds of its service day, or null if not in service. Pure.
 * `dockInfo` gives a dock stay's abreast slot and tight turns (berths.ts); without it every
 * vessel uses the quay and turns on the spot.
 */
export function vesselPose(v: Vessel, path: LinePath, t: number, p: DockingParams, dockInfo?: (seg: Segment) => DockInfo | undefined): VesselPose | null {
  const s = vesselStateAt(v, t);
  if (!s) return null;
  const i = findSegment(v.segments, t);
  // Slots and tight turns need berth geometry (which way is seaward / alongside).
  const info = (seg: Segment | undefined) => (seg?.kind === 'dock' && path.berths ? dockInfo?.(seg) : undefined);
  if (s.phase === 'underway') {
    const leg = path.legs[s.legIndex!];
    const pose = poseOnLeg(leg, s.distance, s.dir!);
    // Near either end of the leg, blend toward that end's berth (and the slot it left / is heading for);
    // on a short leg the two blends meet in the middle at zero.
    const toEnd = s.legLength - s.distance;
    const [before, after] = [v.segments[i - 1], v.segments[i + 1]];
    const near = s.distance < toEnd ? { stop: s.fromStopIndex!, d: s.distance, seg: before } : { stop: s.nextStopIndex, d: toEnd, seg: after };
    const b = path.berths?.[near.stop];
    // Tight turns are sailed: from alongside into the course leaving, from the course into alongside arriving.
    // The turn direction is fixed by the course at the end of the turn (a U-turn never flips side).
    let bearing = pose.bearing;
    const T = Math.min(p.tightTurnM ?? 160, s.legLength / 2);
    const sailed = (side: number, ref: number, w: number) => (side + (wrap(ref - side) + wrap(bearing - ref)) * w + 360) % 360;
    if (info(before)?.tightOut) bearing = sailed(dockSide(before as Dock, path), poseOnLeg(leg, T, s.dir!).bearing, smooth(s.distance / T));
    if (info(after)?.tightIn) bearing = sailed(dockSide(after as Dock, path), poseOnLeg(leg, s.legLength - T, s.dir!).bearing, smooth(toEnd / T));
    let weight = 1 - smooth(near.d / Math.min(p.berthBlendM, s.legLength / 2));
    let lngLat = pose.lngLat;
    // Blocked by a vessel moored outside: slide along the quay past its hull first, then swing out / in.
    const out = near.seg === before && info(before)?.blockedOut;
    const inn = near.seg === after && info(after)?.blockedIn;
    if (p.hullM && b && (out || inn)) {
      const D = Math.min(s.legLength / 2, slideM(p.hullM));
      if (near.d < D) {
        const dock = (out ? before : after) as Dock;
        const side = dockSide(dock, path);
        const at = dockPoses(dock, path).at.lngLat;
        const [ux, uy] = [Math.sin((side * Math.PI) / 180), Math.cos((side * Math.PI) / 180)];
        // Slide along the quay towards the side the route goes (out) / comes from (in) — astern if need be —
        // so the swing out / in never crosses back over the moored hull.
        const endPose = poseOnLeg(leg, out ? D : s.legLength - D, s.dir!);
        const end = endPose.lngLat;
        const ex = (end[0] - at[0]) * 111_320 * Math.cos((at[1] * Math.PI) / 180);
        const ey = (end[1] - at[1]) * 110_574;
        // 1.2 hull lengths clears the moored hull; a short leg (drawn hulls longer than it) gets what fits.
        const k = (ex * ux + ey * uy >= 0 ? 1 : -1) * Math.min(p.hullM * 1.2, D * 0.8);
        const q1 = offsetLngLat(at, ux * k, uy * k);
        const u = near.d / D;
        if (u < 0.5) {
          const a = smooth(u * 2);
          lngLat = lerpLngLat(at, q1, a);
          bearing = side;
          weight = 1;
        } else {
          const a = smooth(u * 2 - 1);
          lngLat = lerpLngLat(q1, pose.lngLat, a);
          // Turn direction fixed by the course where the slide ends (never flips mid-turn).
          bearing = sailed(side, endPose.bearing, a);
          // From the slot (1) to the ordinary berth blend where the slide ends: continuous at both ends.
          const wEnd = 1 - smooth(D / Math.min(p.berthBlendM, s.legLength / 2));
          weight = 1 + (wEnd - 1) * a;
        }
      }
    }
    return { state: s, vessel: v, t, lngLat, bearing, berth: b && { ...b, slot: info(near.seg)?.slot ?? 0, weight } };
  }
  const seg = v.segments[i] as Dock;
  const { at: pose, arrival, departure } = dockPoses(seg, path);
  const b = path.berths?.[seg.stopIndex];
  const d = info(seg);
  const bearing = dockedHeading(arrival?.bearing ?? null, departure?.bearing ?? null, b?.along ?? null, s.phaseElapsed, s.phaseRemaining, p.turnSeconds, d && { in: d.tightIn || d.blockedIn, out: d.tightOut || d.blockedOut });
  return { state: s, vessel: v, t, lngLat: pose.lngLat, bearing, berth: b && { ...b, slot: d?.slot ?? 0, weight: 1 } };
}

/** Hull clearance near a pier, all lengths in metres of the drawn (exaggerated) hull. */
export interface BerthOffsetParams {
  beamM: number;
  /** Extra seaward clearance at the quay (fraction of beam). */
  quayClearance: number;
  /** Real distance of berth points off the coastline. */
  berthOffsetM: number;
  /** Abreast spacing between hull centres (in beams). */
  slotSpacing: number;
  /** Drawn hull length: sibling berths of one pier closer than this spread apart (along the line between them). */
  lengthM?: number;
  /** Real hull length (CONFIG.ferries.lengthM): how exaggerated `lengthM` is, for private operators' berths. */
  realLengthM?: number;
}

/** Exaggeration the city-zoom shift of a private operator's berth is worked out for (scripts/build-piers.ts CITY_EXAG). */
export const OPERATOR_CITY_EXAG = 3.9;

/**
 * Seaward offset (metres east, north) of a vessel near a pier: clears the quay for exaggerated hulls
 * and moors slot 1, 2, … abreast outside slot 0 — never towards land. Fades with the berth weight.
 */
export function berthOffset(b: VesselPose['berth'], o: BerthOffsetParams): [number, number] {
  if (!b || b.weight <= 0) return [0, 0];
  const r = (b.seaward * Math.PI) / 180;
  const quay = Math.max(0, (o.beamM / 2) * (1 + o.quayClearance) - o.berthOffsetM);
  const d = (quay + b.slot * o.beamM * o.slotSpacing) * b.weight;
  // Two OSM berths of one pier closer than a drawn hull (Eminönü at city zoom): each moves half the shortfall away.
  const sp = b.spread;
  if (sp && sp.length === 7 && o.lengthM) {
    // A private operator's berth (build-piers.ts): its own shift away from Şehir Hatları boats, in drawn hull lengths,
    // real-size → city-zoom interpolated by exaggeration (checked on water at both ends).
    const f = Math.min(1, Math.max(0, (o.lengthM / (o.realLengthM ?? o.lengthM) - 1) / (OPERATOR_CITY_EXAG - 1)));
    const e = (sp[3] + (sp[5] - sp[3]) * f) * o.lengthM * b.weight;
    const n = (sp[4] + (sp[6] - sp[4]) * f) * o.lengthM * b.weight;
    return [Math.sin(r) * d + e, Math.cos(r) * d + n];
  }
  const s = sp && o.lengthM ? Math.max(0, (o.lengthM * 1.08 - sp[2]) / 2) * b.weight : 0;
  return [Math.sin(r) * d + (s && sp![0] * s), Math.cos(r) * d + (s && sp![1] * s)];
}

/** Slot / tight / blocked info of a service day's dock stays (cached per schedule in berths.ts). */
export function dockInfoFor(getDay: (day: number) => DaySchedule, day: number, paths: Map<string, LinePath>, p: DockingParams): (seg: Segment) => DockInfo | undefined {
  const slots = daySlots(getDay, day, paths, { padS: p.slotPadS ?? 120, turnS: p.turnSeconds });
  return (seg) => slots.get(seg);
}

/**
 * Pose of every vessel in service at a local instant — pure: f(schedules, paths, time).
 * Looks at yesterday's schedule too (late trips run past midnight).
 * Docked vessels sit on their stop vertex and turn alongside the pier, then out again; several at
 * one berth moor abreast (berth slots).
 */
export function fleetAt(getDay: (day: number) => DaySchedule, paths: Map<string, LinePath>, at: LocalTime, p: DockingParams): VesselPose[] {
  const out: VesselPose[] = [];
  for (const [day, t] of [
    [at.day - 1, at.seconds + DAY_S],
    [at.day, at.seconds],
  ] as const) {
    const dockInfo = dockInfoFor(getDay, day, paths, p);
    for (const v of getDay(day).vessels) {
      const path = paths.get(v.lineId);
      const pose = path && vesselPose(v, path, t, p, dockInfo);
      if (pose) out.push(((pose.day = day), pose));
    }
  }
  return out;
}
