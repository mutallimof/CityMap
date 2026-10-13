/** Service pattern for a simulated line (plan §4.6). Times are Istanbul local "HH:MM". */
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
  /** Every pier the line calls at (display order). Stop indices elsewhere refer to this list. */
  stops: string[];
  /** Simulated fallback: outbound stop sequence (pier ids); inbound runs it reversed. */
  pattern: string[];
  /** Berth id per stop (same order as stops). */
  berths?: string[];
  /** Simulated headways, and dwell + cruise speed used for any times a timetable doesn't print. */
  service: ServiceSpec;
  /** Open questions for a human (data/catalog/lines.json). */
  toCheck?: string[];
  /** Private operator id (data/catalog/operators.json: 'turyol', 'dentur'); absent = Şehir Hatları. */
  operator?: string;
}

/** One sailing leg between two stops of a line (undirected geometry from → to). */
export interface LegSpec {
  /** Stop indices at the geometry's start and end. */
  from: number;
  to: number;
  length: number; // m
}

/** Traversal of a leg: 'out' = along the geometry (from → to), 'back' = reversed. */
export type Direction = 'out' | 'back';

export interface LegRef {
  leg: number;
  dir: Direction;
}

/** A one-way trip: the stops it calls at, in order. */
export interface TripRef {
  id: string;
  t0: number;
  t1: number;
  /** Stop indices called at, in sailing order. */
  stops: number[];
  /** From the operator's timetable (true) or the simulated fallback. */
  real: boolean;
  /** The order of calls is not printed (a private operator's boat printed to two destinations). */
  orderInferred?: true;
}

/** Times are seconds since the service day's local midnight. */
export type Segment =
  | {
      kind: 'dock';
      t0: number;
      t1: number;
      stopIndex: number;
      /** Leg it arrived on / will leave on (null: appears here / retires here). */
      arrive: LegRef | null;
      depart: LegRef | null;
      /** The trip it is on (intermediate stop) or about to start (layover). */
      trip?: TripRef;
    }
  | {
      kind: 'leg';
      t0: number;
      t1: number;
      legIndex: number;
      dir: Direction;
      fromStop: number;
      toStop: number;
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
  /** Every published departure from every stop, for pier boards. */
  departures: Departure[];
}

export interface Departure {
  lineId: string;
  tripId: string;
  stopId: string;
  /** Seconds since the service day's local midnight (may exceed 86400 after midnight). */
  t: number;
  /** Final stop of this trip. */
  toStopId: string;
  /** Printed in the operator's timetable (false: simulated). */
  real: boolean;
  /** Footnote marker and Kadıköy pier, as printed. */
  mark?: string;
  pier?: 'old' | 'new';
  /**
   * A private operator's sailing printed to several destinations (scripts/operators merge): the piers it
   * calls at before `toStopId`. Their order is not printed (pier board †).
   */
  via?: string[];
}

export type VesselPhase = 'docked' | 'underway';

/** Everything the render layer needs for one vessel at one instant. */
export interface VesselState {
  vesselId: string;
  lineId: string;
  phase: VesselPhase;
  /** Underway: leg, traversal, and the stop it left. */
  legIndex?: number;
  dir?: Direction;
  fromStopIndex?: number;
  /** Docked: stop index. */
  stopIndex?: number;
  /** Docked: legs it arrived on / leaves on. */
  arrive?: LegRef | null;
  depart?: LegRef | null;
  /** Underway: metres from the leg's start in travel direction. */
  distance: number;
  /** Underway: leg length (m). */
  legLength: number;
  /** m/s, 0 when docked. */
  speed: number;
  /** Seconds since this phase started / until it ends. */
  phaseElapsed: number;
  phaseRemaining: number;
  /** Next stop index the vessel will be at. */
  nextStopIndex: number;
  /** Seconds until arrival at nextStopIndex (0 if docked there). */
  eta: number;
  /** The trip it is on or about to start (absent while retiring). */
  trip?: TripRef;
  /** 0 → 1 within the current one-way trip. */
  tripProgress: number;
  /** Seconds since the vessel entered service / until it leaves (for fade in/out). */
  serviceElapsed: number;
  serviceRemaining: number;
}
