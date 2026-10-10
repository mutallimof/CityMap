/** Service pattern for one ferry line (plan §4.6). Times are Istanbul local "HH:MM". */
export interface ServiceSpec {
  first: string;
  last: string;
  headwayPeak: number; // min
  headwayOff: number; // min
  dwellMin: number; // min, at every stop
  speedKmh: number;
}

export interface LineSpec {
  id: string;
  name: { tr: string; en: string };
  color: string;
  /** Stop ids in outbound order. Inbound runs the same stops reversed. */
  stops: string[];
  routeId: string;
  /** Berth id per stop (same order as stops). */
  berths?: string[];
  service: ServiceSpec;
  simulated: true;
  /** Open questions for a human (data/catalog/lines.json). */
  toCheck?: string[];
}

/** Route lengths per leg, outbound order (leg i = stops[i] → stops[i+1]), metres. */
export interface LineGeometry {
  legLengths: number[];
}

export type Direction = 'out' | 'back';

/** One piece of a vessel's day. Times are seconds since the service day's local midnight. */
/** The one-way trip a segment belongs to (absent for layovers at terminals). */
export interface TripRef {
  id: string;
  t0: number;
  t1: number;
}

export type Segment =
  | { kind: 'dock'; t0: number; t1: number; stopIndex: number; direction: Direction; trip?: TripRef }
  | {
      kind: 'leg';
      t0: number;
      t1: number;
      legIndex: number;
      direction: Direction;
      length: number;
      /** Cruise speed (m/s) and ramp (s) — enough to rebuild the motion profile. */
      cruise: number;
      ramp: number;
      trip: TripRef;
    };

export interface Vessel {
  id: string;
  lineId: string;
  /** Chronological, contiguous segments. */
  segments: Segment[];
}

export interface DaySchedule {
  /** Service day index: days since 1970-01-01 in Istanbul local time. */
  day: number;
  vessels: Vessel[];
  /** Every departure from every stop, for pier boards. */
  departures: Departure[];
}

export interface Departure {
  lineId: string;
  tripId: string;
  stopId: string;
  direction: Direction;
  /** Seconds since the service day's local midnight (may exceed 86400 after midnight). */
  t: number;
  /** Final stop of this trip. */
  toStopId: string;
}

export type VesselPhase = 'docked' | 'underway';

/** Everything the render layer needs for one vessel at one instant. */
export interface VesselState {
  vesselId: string;
  lineId: string;
  phase: VesselPhase;
  direction: Direction;
  /** Underway: leg index in OUTBOUND numbering. Docked: undefined. */
  legIndex?: number;
  /** Docked: stop index in outbound numbering. */
  stopIndex?: number;
  /** Underway: metres from the leg's start in travel direction. */
  distance: number;
  /** Underway: leg length (m). */
  legLength: number;
  /** m/s, 0 when docked. */
  speed: number;
  /** Seconds since this phase started / until it ends. */
  phaseElapsed: number;
  phaseRemaining: number;
  /** Next stop index (outbound numbering) the vessel will be at. */
  nextStopIndex: number;
  /** Seconds until arrival at nextStopIndex (0 if docked there). */
  eta: number;
  /** 0 → 1 within the current one-way trip. */
  tripProgress: number;
  /** Seconds since the vessel entered service / until it leaves (for fade in/out). */
  serviceElapsed: number;
  serviceRemaining: number;
}
