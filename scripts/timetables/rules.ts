/**
 * How each parsed table of the Şehir Hatları timetable becomes trips on our lines. Pure (tested).
 *
 * Reading conventions (all from the PDF's own layout):
 *  - "Row" tables (Kabataş–Adalar, Uzun Boğaz Turu, Rumeli Kavağı – Eminönü, Anadolu Kavağı – Üsküdar):
 *    one row = one trip, columns in sailing order,
 *    KALKIŞ = departure, VARIŞ = arrival, "-" = doesn't call.
 *  - "Cycle" tables (Kadıköy/Üsküdar – Karaköy – Eminönü, the night Kadıköy – Karaköy – Beşiktaş):
 *    each column lists one pier's departures; a row is one vessel's round — it leaves the first pier,
 *    calls at the next printed piers in column order, and the last printed departure is its way back
 *    to the first pier. A row is only read that way when every gap fits one vessel (`link` windows,
 *    minutes); otherwise each printed departure is its own trip (e.g. the Kadıköy ⇄ Karaköy shuttle
 *    after 21:00, where both piers depart at the same minute).
 *  - "Columns" tables (Kadıköy – Beşiktaş): two piers, each column = departures to the other pier.
 *  - Times after midnight belong to the previous service day (stored as 24:00+).
 *  - Footnote markers are mapped by the footnote's printed text, so a renumbered marker in a future
 *    timetable fails loudly instead of silently changing meaning.
 */
import type { CallSpec, DayType, LineTimetable, TimetableFile, TripSpec } from '../../src/sim/timetable-data';

export interface SourceCell {
  t: string;
  m?: string;
}
export interface SourceTable {
  id: string;
  page: number;
  title: string;
  days: string;
  columns: { stop: string; kind: 'dep' | 'arr' }[];
  footnotes: Record<string, string>;
  notes: string[];
  rows: (SourceCell | null)[][];
}
export interface SourceFile {
  source: string;
  validFrom: string;
  validTo: string;
  holidayRule: string;
  tables: SourceTable[];
}

const ALL: DayType[] = ['weekday', 'saturday', 'sunday'];

/** What a footnote means, keyed by its printed Turkish text. */
type Meaning = { days: DayType[] } | { board: false } | { pier: 'old' | 'new' };
const FOOTNOTES: Record<string, Meaning> = {
  'Cumartesi, pazar ve resmi tatil günleri yapılmaz.': { days: ['weekday'] },
  'Pazar ve resmi tatil günleri yapılmaz.': { days: ['weekday', 'saturday'] },
  'Karaköy İskelesi’nde yolcu almaz.': { board: false },
  'Kadıköy (Eski) İskelesi’nden yapılır.': { pier: 'old' },
  'Kadıköy (Yeni) İskelesi’nden yapılır.': { pier: 'new' },
};

/** Day types a table's heading covers. */
const TABLE_DAYS: Record<string, DayType[]> = {
  'HER GÜN': ALL,
  'HAFTA İÇİ VE CUMARTESİ GÜNLERİ': ['weekday', 'saturday'],
  'PAZAR VE RESMİ TATİL GÜNLERİ': ['sunday'],
  'CUMAYI CUMARTESİYE ve CUMARTESİYİ PAZARA BAĞLAYAN GECELER': ALL,
};

interface Rule {
  line: string;
  method: 'rows' | 'cycle' | 'columns';
  /** Cycle: gap windows [min, max] in minutes between consecutive printed departures of one round. */
  link?: Record<string, [number, number]>;
  /** Only on these ISO weekdays of the service day. */
  weekdays?: number[];
  /** Every time before noon is after midnight (night tables). */
  night?: boolean;
  note?: string;
}

const CYCLE_NOTE = (first: string) =>
  `Read as rounds: each row leaves ${first}, calls at the next printed piers in column order, and its last printed departure sails back to ${first}; rows whose gaps don't fit one vessel are separate trips. Arrival times aren't printed and are computed from the route.`;

export const RULES: Record<string, Rule> = {
  'kadikoy-karakoy-eminonu': {
    line: 'kadikoy-karakoy-eminonu',
    method: 'cycle',
    link: { 'kadikoy>karakoy': [15, 35], 'karakoy>eminonu': [3, 20] },
    note: CYCLE_NOTE('Kadıköy'),
  },
  'uskudar-karakoy-eminonu': {
    line: 'uskudar-karakoy-eminonu',
    method: 'cycle',
    link: { 'uskudar>karakoy': [10, 25], 'karakoy>eminonu': [3, 20], 'uskudar>eminonu': [10, 35] },
    note: CYCLE_NOTE('Üsküdar'),
  },
  'kadikoy-besiktas': { line: 'kadikoy-besiktas', method: 'columns' },
  'kadikoy-karakoy-besiktas-night': {
    line: 'kadikoy-besiktas',
    method: 'cycle',
    link: { 'kadikoy>karakoy': [15, 30], 'karakoy>besiktas': [10, 25], 'kadikoy>besiktas': [20, 40] },
    weekdays: [5, 6],
    night: true,
    note: 'Night timetable (Kadıköy – Karaköy – Beşiktaş) runs the nights Friday→Saturday and Saturday→Sunday only. ' + CYCLE_NOTE('Kadıköy'),
  },
  'kabatas-adalar-weekday-out': { line: 'adalar', method: 'rows' },
  'kabatas-adalar-weekday-back': { line: 'adalar', method: 'rows' },
  'kabatas-adalar-sunday-out': { line: 'adalar', method: 'rows' },
  'kabatas-adalar-sunday-back': { line: 'adalar', method: 'rows' },
  'uzun-bogaz-out': { line: 'bogaz', method: 'rows' },
  'uzun-bogaz-back': { line: 'bogaz', method: 'rows' },
  'rumeli-kavagi-eminonu': { line: 'rumeli-kavagi-eminonu', method: 'rows' },
  'eminonu-rumeli-kavagi': { line: 'rumeli-kavagi-eminonu', method: 'rows' },
  'anadolu-kavagi-uskudar': { line: 'anadolu-kavagi-uskudar', method: 'rows' },
  'uskudar-anadolu-kavagi': { line: 'anadolu-kavagi-uskudar', method: 'rows' },
};

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

interface Cell {
  stop: string;
  kind: 'dep' | 'arr';
  min: number;
  mark?: string;
}

/** Times as minutes since the service day's midnight, adding a day where a column/row wraps past midnight. */
function unwrap(table: SourceTable, rule: Rule): (Cell | null)[][] {
  const rows = table.rows.map((r) => r.map((c, k) => (c ? { stop: table.columns[k].stop, kind: table.columns[k].kind, min: minutes(c.t), mark: c.m } : null)));
  if (rule.night) {
    for (const r of rows) for (const c of r) if (c && c.min < 12 * 60) c.min += 1440;
    return rows;
  }
  if (rule.method === 'rows') {
    for (const r of rows) {
      let prev = -1;
      let add = 0;
      for (const c of r) {
        if (!c) continue;
        if (c.min + add < prev) add = 1440;
        c.min += add;
        prev = c.min;
      }
    }
    return rows;
  }
  // Column-wise: a column read top to bottom that jumps back by more than 6 h has passed midnight.
  for (let k = 0; k < table.columns.length; k++) {
    let prev = -1;
    let add = 0;
    for (const r of rows) {
      const c = r[k];
      if (!c) continue;
      if (c.min + add < prev - 360) add = 1440;
      c.min += add;
      prev = c.min;
    }
  }
  return rows;
}

function meaningOf(table: SourceTable, mark: string | undefined, problems: string[]): Meaning | null {
  if (!mark) return null;
  const text = table.footnotes[mark];
  const meaning = text ? FOOTNOTES[text] : undefined;
  if (!meaning) problems.push(`${table.id}: footnote "${mark}" (${text ?? 'no text'}) has no known meaning`);
  return meaning ?? null;
}

function daysOf(table: SourceTable, cells: Cell[], problems: string[]): DayType[] | null {
  const base = TABLE_DAYS[table.days];
  let days: DayType[] | null = null;
  for (const c of cells) {
    const m = meaningOf(table, c.mark, problems);
    const d = m && 'days' in m ? m.days : base;
    if (days && d.join() !== days.join()) return null; // cells of one trip disagree
    days = d;
  }
  return days && days.filter((x) => base.includes(x));
}

function call(table: SourceTable, c: Cell, problems: string[], asTime = true): CallSpec {
  const out: CallSpec = { stop: c.stop };
  if (asTime) out[c.kind] = fmt(c.min);
  const m = meaningOf(table, c.mark, problems);
  if (m && 'board' in m) out.board = false;
  if (m && 'pier' in m) out.pier = m.pier;
  if (c.mark) out.m = c.mark;
  return out;
}

function trip(id: string, days: DayType[], calls: CallSpec[], rule: Rule): TripSpec {
  return { id, days, ...(rule.weekdays ? { weekdays: rule.weekdays } : {}), calls };
}

function tableTrips(table: SourceTable, rule: Rule, problems: string[]): TripSpec[] {
  const base = TABLE_DAYS[table.days];
  if (!base) {
    problems.push(`${table.id}: unknown day heading "${table.days}"`);
    return [];
  }
  const rows = unwrap(table, rule);
  const out: TripSpec[] = [];
  const stops = table.columns.map((c) => c.stop);
  rows.forEach((row, r) => {
    const printed = row.filter((c): c is Cell => !!c);
    const id = `${table.id}:${r + 1}`;
    if (rule.method === 'rows') {
      if (printed.length < 2) return void problems.push(`${id}: a trip needs two calls`);
      if (printed[0].kind !== 'dep') return void problems.push(`${id}: first call has no departure time`);
      if (printed.some((c) => c.mark)) problems.push(`${id}: unexpected footnote marker`);
      out.push(trip(id, base, printed.map((c) => call(table, c, problems)), rule));
      return;
    }
    if (rule.method === 'columns') {
      if (stops.length !== 2) return void problems.push(`${table.id}: columns tables need two piers`);
      for (const c of printed) {
        const days = daysOf(table, [c], problems)!;
        const other = stops.find((s) => s !== c.stop)!;
        out.push(trip(`${id}:${c.stop}`, days, [call(table, c, problems), { stop: other }], rule));
      }
      return;
    }
    // cycle
    const origin = stops[0];
    const linked =
      printed.length >= 2 &&
      printed[0].stop === origin &&
      printed.every((c, i) => {
        if (i === 0) return true;
        const w = rule.link?.[`${printed[i - 1].stop}>${c.stop}`];
        const gap = c.min - printed[i - 1].min;
        return !!w && gap >= w[0] && gap <= w[1];
      });
    const outDays = linked ? daysOf(table, printed.slice(0, -1), problems) : null;
    const backDays = linked ? daysOf(table, printed.slice(-1), problems) : null;
    if (linked && outDays && backDays) {
      const last = printed[printed.length - 1];
      out.push(trip(`${id}:out`, outDays, [...printed.slice(0, -1).map((c) => call(table, c, problems)), { stop: last.stop }], rule));
      out.push(trip(`${id}:back`, backDays, [call(table, last, problems), { stop: origin }], rule));
      return;
    }
    // Separate trips: from the first pier to the next one in column order, from any other pier back to the first.
    for (const c of printed) {
      const to = c.stop === origin ? stops[1] : origin;
      out.push(trip(`${id}:${c.stop}`, daysOf(table, [c], problems)!, [call(table, c, problems), { stop: to }], rule));
    }
  });
  return out;
}

export function buildTimetables(source: SourceFile, generated: string): { file: TimetableFile; problems: string[] } {
  const problems: string[] = [];
  const lines: Record<string, LineTimetable> = {};
  for (const table of source.tables) {
    const rule = RULES[table.id];
    if (!rule) {
      problems.push(`${table.id}: no rule — add one to scripts/timetables/rules.ts`);
      continue;
    }
    const l = (lines[rule.line] ??= { pdf: [], notes: [], trips: [] });
    const ref = `${table.title} (p. ${table.page})`;
    if (!l.pdf.includes(ref)) l.pdf.push(ref);
    for (const [mark, text] of Object.entries(table.footnotes)) {
      const n = `${mark} ${text}`;
      if (!l.notes.includes(n)) l.notes.push(n);
    }
    for (const n of [...table.notes, ...(rule.note ? [rule.note] : [])]) if (!l.notes.includes(n)) l.notes.push(n);
    l.trips.push(...tableTrips(table, rule, problems));
  }
  for (const [id, l] of Object.entries(lines)) {
    for (const t of l.trips) {
      if (!t.days.length) problems.push(`${t.id}: runs on no day`);
      let prev = -1;
      for (const c of t.calls) {
        for (const v of [c.arr, c.dep]) {
          if (!v) continue;
          const m = minutes(v);
          if (m < prev) problems.push(`${t.id}: times go backwards at ${c.stop} (${v})`);
          prev = m;
        }
      }
      if (new Set(t.calls.map((c) => c.stop)).size !== t.calls.length) problems.push(`${t.id}: calls at a pier twice`);
    }
    if (!l.trips.length) problems.push(`${id}: no trips`);
  }
  return {
    file: {
      source: source.source,
      publisher: 'İBB Şehir Hatları A.Ş.',
      url: 'https://www.sehirhatlari.istanbul',
      validFrom: source.validFrom,
      validTo: source.validTo,
      generated,
      lines,
    },
    problems,
  };
}
