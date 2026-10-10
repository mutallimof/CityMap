import type { Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import type { ClockController } from '../app/clock';
import type { DaylightController } from '../app/daylight';
import type { VapurLayer } from '../ferries/vapur-layer';
import type { PierProps } from '../data/load';
import type { Network } from '../sim/network';
import type { DaySchedule, LineSpec } from '../sim/types';

/** Everything the UI needs from the map/sim side, set once at boot. */
export interface Services {
  map: MlMap;
  clock: ClockController;
  daylight: DaylightController;
  ferries: VapurLayer;
  network: Network;
  getDay: (day: number) => DaySchedule;
  lines: LineSpec[];
  lineById: Map<string, LineSpec>;
  piers: FeatureCollection<Point, PierProps>;
  pierById: Map<string, PierProps & { lngLat: [number, number] }>;
}

let current: Services | null = null;

export function setServices(s: Services): void {
  current = s;
}

export function services(): Services {
  if (!current) throw new Error('services not initialised');
  return current;
}
