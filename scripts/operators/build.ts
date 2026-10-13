/**
 * Parsed operator tables → the timetable schema the ferry sim and planner already read
 * (src/sim/timetable-data.ts, same as data/timetables.json). Pure.
 *
 * Rules (no guessing of times):
 *  - every printed departure (pier → pier, day type) is one direct trip of two calls; the arrival isn't
 *    printed, so the app computes it from the route length (as for Şehir Hatları);
 *  - except a catalogued `merge` (one origin, several destinations): when the origin's printed columns to
 *    those destinations are identical on a day type, each departure is ONE sailing calling at them in the
 *    catalogued order (Turyol prints Kadıköy Yeni → Karaköy and → Eminönü with the same times: one boat,
 *    not two). The order is not printed, so these trips carry `orderInferred` (pier board †). A day whose
 *    columns differ keeps direct trips;
 *  - the same departure printed on several day types is one trip with those days;
 *  - "continuous service" windows are kept as notes (`continuous`), no departures are invented for them;
 *  - validity: neither site prints one, so a read counts from the day its content was first seen until
 *    `horizonDays` after the last successful read (unchanged content keeps its first-seen date).
 */
import type { ContinuousService, DayType, LineTimetable, OperatorInfo, TimetableFile, TripSpec } from '../../src/sim/timetable-data';
import type { Continuous, DayColumns } from './parse';

export const DAY_ORDER: DayType[] = ['weekday', 'saturday', 'sunday'];

export interface PairRead {
  from: string;
  to: string;
  columns: DayColumns;
  continuous?: Continuous[];
  /** Human-readable source of this table ("Turyol: Kadıköy Metro İskele Kalkış / Karaköy"). */
  source: string;
}

export interface LineCatalog {
  id: string;
  operator: string;
  holidays: 'sunday' | 'none';
  /** One origin's departures to these destinations (in calling order) are one sailing when printed identically. */
  merge?: { from: string; to: string[]; why: string }[];
}

export interface OperatorCatalog extends OperatorInfo {
  file: string;
  source: string;
  publisher: string;
  url: string;
}

const hhmm = (t: string) => t.replace(':', '');

export function tripsFromPairs(lineId: string, reads: PairRead[], merges: LineCatalog['merge'] = []): { trips: TripSpec[]; notes: string[] } {
  const notes: string[] = [];
  const byKey = new Map<string, { from: string; to: string[]; dep: string; days: Set<DayType> }>();
  const add = (from: string, to: string[], dep: string, day: DayType) => {
    const key = `${from}>${to.join('+')}@${dep}`;
    const e = byKey.get(key) ?? { from, to, dep, days: new Set<DayType>() };
    e.days.add(day);
    byKey.set(key, e);
  };
  const col = (from: string, to: string, day: DayType) => reads.find((r) => r.from === from && r.to === to)?.columns[day];
  for (const day of DAY_ORDER) {
    const merged = new Set<string>();
    for (const m of merges) {
      const cols = m.to.map((to) => col(m.from, to, day));
      if (cols.some((c) => !c)) continue;
      if (cols.every((c) => JSON.stringify(c) === JSON.stringify(cols[0]))) {
        for (const dep of cols[0]!) add(m.from, m.to, dep, day);
        for (const to of m.to) merged.add(`${m.from}>${to}`);
      } else notes.push(`${day}: ${m.from} → ${m.to.join(' / ')} printed with different times — kept as separate sailings that day.`);
    }
    for (const r of reads) if (!merged.has(`${r.from}>${r.to}`)) for (const dep of r.columns[day]) add(r.from, [r.to], dep, day);
  }
  const trips = [...byKey.values()]
    .sort((a, b) => (a.dep < b.dep ? -1 : a.dep > b.dep ? 1 : a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
    .map(
      (e): TripSpec => ({
        id: `${lineId}:${e.from}>${e.to.join('+')}:${hhmm(e.dep)}`,
        days: DAY_ORDER.filter((d) => e.days.has(d)),
        ...(e.to.length > 1 ? { orderInferred: true as const } : {}),
        calls: [{ stop: e.from, dep: e.dep }, ...e.to.map((stop) => ({ stop }))],
      }),
    );
  return { trips, notes };
}

export function continuousOf(reads: PairRead[]): ContinuousService[] {
  return reads.flatMap((r) => (r.continuous ?? []).map((c) => ({ stop: r.from, to: r.to, days: c.days, start: c.start, end: c.end })));
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const signature = (l: Pick<LineTimetable, 'trips' | 'continuous'>) => JSON.stringify([l.trips, l.continuous ?? []]);

/** One line's timetable from a successful read (`prev` = the committed one, for its first-seen date). */
export function lineTimetable(
  spec: LineCatalog,
  reads: PairRead[],
  o: { url: string; fetched: string; today: string; horizonDays: number; prev?: LineTimetable },
): LineTimetable {
  const { trips, notes } = tripsFromPairs(spec.id, reads, spec.merge);
  const continuous = continuousOf(reads);
  const same = o.prev && signature(o.prev) === signature({ trips, continuous });
  return {
    pdf: reads.map((r) => r.source),
    notes: [
      'Each printed departure (pier → pier, day type) is one direct sailing; arrival times are not printed and come from the route length.',
      spec.holidays === 'none'
        ? 'The source prints no holiday timetable: on public holidays this line shows the simulated schedule.'
        : 'Public holidays run the Sunday timetable (as the source says).',
      'The source prints no validity period: valid from the day this content was first read until ' + o.horizonDays + ' days after the last successful read.',
      ...(continuous.length ? ['“Arası sürekli sefer” (continuous service) windows are printed without times: shown as a note, no departures are made up.'] : []),
      ...(spec.merge ?? []).map((m) => `${m.from} → ${m.to.join(' → ')}: one sailing when the times are printed identically (order of calls inferred: ${m.why}).`),
      ...notes,
    ],
    trips,
    ...(continuous.length ? { continuous } : {}),
    url: o.url,
    fetched: o.fetched,
    holidays: spec.holidays,
    validFrom: same && o.prev?.validFrom ? o.prev.validFrom : o.today,
    validTo: addDays(o.today, o.horizonDays),
  };
}

/** The operator's file: file-level validity spans its lines (each line's own dates decide). */
export function assembleFile(op: OperatorCatalog, lines: Record<string, LineTimetable>, generated: string): TimetableFile {
  const ls = Object.values(lines);
  const from = ls.map((l) => l.validFrom!).sort()[0] ?? generated;
  const to = ls.map((l) => l.validTo!).sort().at(-1) ?? generated;
  return {
    operator: { id: op.id, name: op.name, site: op.site },
    source: op.source,
    publisher: op.publisher,
    url: op.url,
    validFrom: from,
    validTo: to,
    generated,
    lines,
  };
}
