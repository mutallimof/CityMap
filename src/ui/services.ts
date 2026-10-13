import type { Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import type { ClockController } from '../app/clock';
import type { DaylightController } from '../app/daylight';
import type { VapurLayer } from '../ferries/vapur-layer';
import type { WeatherController } from '../weather/controller';
import type { PierProps } from '../data/load';
import type { Network } from '../sim/network';
import type { DaySchedule, LineSpec } from '../sim/types';
import type { LineMode } from '../sim/schedule';
import type { TimetableFile } from '../sim/timetable-data';
import type { LandIndex } from '../plan/land';

/** Everything the UI needs from the map/sim side, set once at boot. */
export interface Services {
  map: MlMap;
  clock: ClockController;
  daylight: DaylightController;
  ferries: VapurLayer;
  weather: WeatherController;
  network: Network;
  getDay: (day: number) => DaySchedule & { modes: Record<string, LineMode> };
  /** The real timetable file (source credit), or null. */
  timetables: TimetableFile | null;
  lines: LineSpec[];
  lineById: Map<string, LineSpec>;
  piers: FeatureCollection<Point, PierProps>;
  pierById: Map<string, PierProps & { lngLat: [number, number] }>;
  /** Landmasses of data/land.geojson (the planner walks only within one). */
  land: LandIndex;
}

let current: Services | null = null;

export function setServices(s: Services): void {
  current = s;
}

export function services(): Services {
  if (!current) throw new Error('services not initialised');
  return current;
}
