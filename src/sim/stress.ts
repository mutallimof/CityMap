import { buildDaySchedule, type LineInput } from './schedule';
import { cachedDays, vesselsAt } from './state';
import type { LocalTime } from './time';
import type { DaySchedule } from './types';

/**
 * Performance-test mode (?stress=N): every line runs all day on one uniform headway, the
 * longest headway (in whole minutes) that puts at least N vessels on the water at `at`.
 * Still a pure, valid timetable — just a denser one.
 */
export function stressInputs(inputs: LineInput[], target: number, at: LocalTime): { inputs: LineInput[]; headway: number } {
  let best = { inputs, headway: 0 };
  for (let h = 30; h >= 2; h--) {
    const dense = inputs.map((i) => ({
      ...i,
      line: { ...i.line, service: { ...i.line.service, first: '00:00', last: '23:59', headwayPeak: h, headwayOff: h } },
    }));
    const getDay = cachedDays((d): DaySchedule => buildDaySchedule(dense, d));
    best = { inputs: dense, headway: h };
    if (vesselsAt(getDay, at).length >= target) break;
  }
  return best;
}
