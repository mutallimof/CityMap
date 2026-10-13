/**
 * Real timetables → planned trips for one service day. Pure.
 * A line runs on its real timetable only when its file covers that date (a private operator's line:
 * its own dates, scripts/operators) and every one of the line's trips can be sailed on our routes;
 * otherwise it falls back to the simulated schedule (labelled so). Several files: Şehir Hatları
 * (data/timetables.json) + one per private operator (data/timetables-<operator>.json).
 */
import { CONFIG } from '../config';
import { findLeg, type PlannedTrip, type RealTrips } from './schedule';
import { clockToSeconds, type DayType, type HolidayFile, type TimetableFile, type TripSpec } from './timetable-data';
import type { LegSpec, LineSpec } from './types';

/** ISO date "YYYY-MM-DD" of a service day (days since 1970-01-01, Istanbul). */
export function isoDate(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/** ISO weekday of a service day: 1 = Monday … 7 = Sunday (1970-01-01 was a Thursday). */
export function isoWeekday(day: number): number {
  return ((((day + 3) % 7) + 7) % 7) + 1;
}

/** Which timetable applies: public holidays run the Sunday timetable (as the source says). */
export function dayTypeOf(day: number, holidays: HolidayFile | null): DayType {
  if (holidays?.days[isoDate(day)]) return 'sunday';
  const wd = isoWeekday(day);
  return wd === 7 ? 'sunday' : wd === 6 ? 'saturday' : 'weekday';
}

export type TimetableStatus = 'valid' | 'not-yet' | 'expired' | 'missing';

export function timetableStatus(tt: TimetableFile | null, day: number): TimetableStatus {
  if (!tt || !tt.validFrom || !tt.validTo || !tt.lines || !Object.keys(tt.lines).length) return 'missing';
  const d = isoDate(day);
  return d < tt.validFrom ? 'not-yet' : d > tt.validTo ? 'expired' : 'valid';
}

/** Days from `day` to the last valid day (negative once expired). */
export function daysLeft(tt: Pick<TimetableFile, 'validTo'>, day: number): number {
  return Math.round(Date.parse(`${tt.validTo}T00:00:00Z`) / 86_400_000 - day);
}

/** Timetable files as given (one, a list, or none). */
export const fileList = (tt: TimetableFile | readonly TimetableFile[] | null | undefined): readonly TimetableFile[] => (!tt ? [] : Array.isArray(tt) ? tt : [tt as TimetableFile]);

/** The file holding a line's timetable, or null. */
export function fileOfLine(tt: TimetableFile | readonly TimetableFile[] | null | undefined, lineId: string): TimetableFile | null {
  return fileList(tt).find((f) => f.lines?.[lineId]) ?? null;
}

/** A line's own validity (its dates if it has them, else the file's) on a service day. */
export function lineValidity(tt: TimetableFile | null, lineId: string, day: number): { status: TimetableStatus; validFrom: string; validTo: string; daysLeft: number } {
  const lt = tt?.lines?.[lineId];
  if (!tt || !lt) return { status: 'missing', validFrom: '', validTo: '', daysLeft: 0 };
  const validFrom = lt.validFrom ?? tt.validFrom;
  const validTo = lt.validTo ?? tt.validTo;
  const status = timetableStatus({ ...tt, validFrom, validTo }, day);
  return { status, validFrom, validTo, daysLeft: daysLeft({ validTo }, day) };
}

/** Why a line is on its simulated schedule on a day (null: it runs its real timetable, if sailable). */
export function lineFallback(tt: TimetableFile | readonly TimetableFile[] | null | undefined, lineId: string, day: number, holidays: HolidayFile | null): TimetableStatus | 'holiday' | null {
  const f = fileOfLine(tt, lineId);
  const v = lineValidity(f, lineId, day);
  if (v.status !== 'valid') return v.status;
  // The source prints nothing for public holidays: don't assume the Sunday timetable.
  if (f!.lines[lineId].holidays === 'none' && holidays?.days[isoDate(day)]) return 'holiday';
  return null;
}

/** Problems that make a line's timetable unusable on our network (empty → usable). */
export function lineProblems(line: LineSpec, legs: LegSpec[], trips: TripSpec[]): string[] {
  const out: string[] = [];
  if (!trips.length) out.push(`${line.id}: no trips`);
  for (const t of trips) {
    const idx = t.calls.map((c) => line.stops.indexOf(c.stop));
    if (idx.some((i) => i < 0)) out.push(`${t.id}: calls at a pier not on ${line.id}`);
    else for (let i = 0; i < idx.length - 1; i++) if (!findLeg(legs, idx[i], idx[i + 1])) out.push(`${t.id}: no route ${t.calls[i].stop} → ${t.calls[i + 1].stop}`);
    try {
      if (!t.calls[0]?.dep) out.push(`${t.id}: no first departure`);
      for (const c of t.calls) for (const v of [c.dep, c.arr]) if (v) clockToSeconds(v);
    } catch (e) {
      out.push(`${t.id}: ${(e as Error).message}`);
    }
  }
  return out;
}

function planned(line: LineSpec, t: TripSpec): PlannedTrip {
  const last = t.calls.length - 1;
  return {
    id: t.id,
    real: true,
    calls: t.calls.map((c, i) => ({
      stop: line.stops.indexOf(c.stop),
      // A time printed under "departure" at a trip's last pier: the vessel is there by then.
      ...(c.dep !== undefined ? (i === last ? { atPier: clockToSeconds(c.dep) } : { dep: clockToSeconds(c.dep) }) : {}),
      ...(c.arr !== undefined ? { arr: clockToSeconds(c.arr) } : {}),
      ...(c.board === false ? { board: false } : {}),
      ...(c.m ? { mark: c.m } : {}),
      ...(c.pier ? { pier: c.pier } : {}),
    })),
    ...(t.orderInferred ? { orderInferred: true } : {}),
  };
}

/**
 * Real-trip source for buildDaySchedule. Lines whose timetable fails `lineProblems` are simulated
 * (reported once via `onProblem`); dates outside the timetable's validity simulate every line.
 */
export function realTripSource(tt: TimetableFile | readonly TimetableFile[] | null, holidays: HolidayFile | null, legsOf: (lineId: string) => LegSpec[], onProblem: (msg: string) => void = () => {}): RealTrips {
  const usable = new Map<string, boolean>();
  return (line, day) => {
    if (lineFallback(tt, line.id, day, holidays)) return null;
    const lt = fileOfLine(tt, line.id)!.lines[line.id];
    if (!usable.has(line.id)) {
      const p = lineProblems(line, legsOf(line.id), lt.trips);
      usable.set(line.id, p.length === 0);
      for (const m of p.slice(0, 5)) onProblem(m);
    }
    if (!usable.get(line.id)) return null;
    const type = dayTypeOf(day, holidays);
    const wd = isoWeekday(day);
    return lt.trips.filter((t) => t.days.includes(type) && (!t.weekdays || t.weekdays.includes(wd))).map((t) => planned(line, t));
  };
}

/** Console-only notice when the timetable is close to its end date (CONFIG.timetable.expiryWarnDays). */
export function expiryWarning(tt: TimetableFile | null, day: number): string | null {
  if (!tt || timetableStatus(tt, day) !== 'valid') return null;
  const left = daysLeft(tt, day);
  if (tt.operator) {
    const old = Object.keys(tt.lines).filter((id) => {
      const v = lineValidity(tt, id, day);
      return v.status === 'valid' && v.daysLeft < CONFIG.timetable.expiryWarnDays;
    });
    return old.length ? `${tt.operator.name} timetable: ${old.join(', ')} not re-read lately (scripts/operators, data/operators-log.json).` : null;
  }
  return left < CONFIG.timetable.expiryWarnDays ? `Ferry timetable "${tt.source}" ends ${tt.validTo} (${left} days left) — run scripts/timetables with the new PDF.` : null;
}
