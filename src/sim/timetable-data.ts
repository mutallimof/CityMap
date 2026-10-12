/**
 * Real ferry timetables as committed in data/timetables.json (built from the operator's published
 * timetable by scripts/timetables). Every time here is printed in the source; times the source
 * doesn't print (most arrivals) are absent and get computed from the route length.
 */

/** Sunday covers Sundays and public holidays (the source: "resmi tatil günlerinde pazar tarifesi uygulanır"). */
export type DayType = 'weekday' | 'saturday' | 'sunday';
export interface CallSpec {
  /** Pier id (data/piers.geojson). */
  stop: string;
  /** "HH:MM" since the service day's midnight; hours ≥ 24 = after midnight (previous service day). */
  dep?: string;
  arr?: string;
  /** false: the vessel calls but takes no passengers here (not shown as a departure). */
  board?: false;
  /** Which of the two Kadıköy piers, when the source says so. */
  pier?: 'old' | 'new';
  /** Footnote marker as printed ("*", "**", "***"). */
  m?: string;
}

export interface TripSpec {
  id: string;
  /** Day types the trip runs on. */
  days: DayType[];
  /** Only on these ISO weekdays of the service day (1 = Monday … 7 = Sunday), e.g. Fri/Sat-night trips. */
  weekdays?: number[];
  /** Calls in sailing order; the first has `dep`. */
  calls: CallSpec[];
}

export interface LineTimetable {
  /** Source table(s), e.g. "KADIKÖY - KARAKÖY - EMİNÖNÜ HATTI (p. 4)". */
  pdf: string[];
  /** Footnotes and how the tables were read. */
  notes: string[];
  trips: TripSpec[];
}

export interface TimetableFile {
  /** Source credit shown in the app. */
  source: string;
  publisher: string;
  url: string;
  /** Inclusive validity, Istanbul dates "YYYY-MM-DD". */
  validFrom: string;
  validTo: string;
  generated: string;
  lines: Record<string, LineTimetable>;
}

export interface HolidayFile {
  /** Full-day public holidays "YYYY-MM-DD" → name. */
  days: Record<string, string>;
  /** Half-day eves (arife / 28 Oct): listed for reference, the normal timetable applies. */
  halfDays: Record<string, string>;
  /** Range the list is complete for. */
  covers: [string, string];
  sources: string[];
}

/** "HH:MM" (hours may exceed 23) → seconds. */
export function clockToSeconds(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m || Number(m[2]) > 59) throw new Error(`Bad time "${s}"`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
}
