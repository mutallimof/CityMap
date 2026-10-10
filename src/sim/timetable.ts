import { CONFIG } from '../config';
import { parseHHMM } from './time';
import type { ServiceSpec } from './types';

export type PeakWindows = readonly (readonly [string, string])[];

export function isPeak(seconds: number, windows: PeakWindows = CONFIG.sim.peakWindows): boolean {
  return windows.some(([a, b]) => seconds >= parseHHMM(a) && seconds < parseHHMM(b));
}

/**
 * Departure times (seconds since local midnight) from the line's origin for one service day.
 * Headway is chosen by whether the *previous* departure was in a peak window.
 * A `last` earlier than `first` means service runs past midnight.
 */
export function originDepartures(service: ServiceSpec, windows: PeakWindows = CONFIG.sim.peakWindows): number[] {
  const first = parseHHMM(service.first);
  let last = parseHHMM(service.last);
  if (last < first) last += 86_400;
  const out: number[] = [];
  for (let t = first; t <= last; ) {
    out.push(t);
    t += (isPeak(t % 86_400, windows) ? service.headwayPeak : service.headwayOff) * 60;
  }
  return out;
}
