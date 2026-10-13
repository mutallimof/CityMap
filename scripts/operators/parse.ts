/**
 * Pure parsers for the private ferry operators' published timetables (scripts/operators/scrape.ts).
 * Facts only: departure times per pier, day type, and "continuous service" windows. Prices, texts and
 * images on those pages are never kept. Every parser refuses (throws) when the page doesn't look the
 * way it did when the parser was written, so a redesign shows up as a failed read, not as wrong times.
 *
 *  - Turyol (turyol.com/Home/Tarifeler, a POST search form): one table per pier pair, titled
 *    "<pier> Kalkış / <pier>", columns HAFTAİÇİ / CUMARTESİ / PAZAR, one departure time per cell.
 *    The destinations offered from a pier come from the site's own JSON (/Tarife/GetVarislar2).
 *  - Dentur Avrasya (denturavrasya.com/tr-TR/hatlarimiz/<line>, Next.js): the timetable HTML sits in the
 *    page's RSC payload (self.__next_f.push). One column per departure pier ("ÜSKÜDAR KALKIŞ"), a table
 *    HAFTA İÇİ / CUMARTESİ / PAZAR; "-" = no departure; a cell "16:00 - 18:30 Arası Sürekli Sefer" =
 *    boats run continuously in that window without printed times.
 */
import type { DayType } from '../../src/sim/timetable-data';
import { decode } from '../events/parse';

export type DayColumns = Record<DayType, string[]>;

export interface Continuous {
  days: DayType[];
  start: string;
  end: string;
}

/** Turkish upper-case header → day type. */
const DAY_HEADERS: Record<string, DayType> = { HAFTAİÇİ: 'weekday', CUMARTESİ: 'saturday', PAZAR: 'sunday' };

const squash = (s: string) => decode(s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const dayOf = (header: string): DayType => {
  const d = DAY_HEADERS[squash(header).toLocaleUpperCase('tr').replace(/\s+/g, '')];
  if (!d) throw new Error(`unknown day column "${squash(header)}"`);
  return d;
};

/** "7:05" / "07:05" → "07:05"; anything else (but "" / "-") throws. */
function clock(cell: string): string | null {
  const t = squash(cell);
  if (t === '' || t === '-' || t === '–') return null;
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(t);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`unexpected cell "${t}"`);
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/**
 * Times of one column in printed order → service-day clock: once the column has run past the evening, a
 * time earlier than the one before belongs to after midnight ("00:15" after "23:50" → "24:15").
 * A column that goes backwards during the day is refused (a misread or a reordered page).
 */
export function serviceDayTimes(times: string[]): string[] {
  const out: string[] = [];
  let prev = -1;
  let wrapped = false;
  for (const t of times) {
    const [h, m] = t.split(':').map(Number);
    if (wrapped && h >= 5) throw new Error(`times go backwards: ${t} after ${fmt(prev)}`);
    let min = h * 60 + m + (wrapped ? 1440 : 0);
    if (min < prev) {
      if (wrapped || prev < 20 * 60 || h >= 5) throw new Error(`times go backwards: ${t} after ${fmt(prev)}`);
      wrapped = true;
      min += 1440;
    }
    if (min === prev) throw new Error(`time printed twice: ${t}`);
    out.push(fmt(min));
    prev = min;
  }
  return out;
}
const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function tableColumns(table: string): { days: DayType[]; rows: string[][] } {
  const head = /<thead[\s\S]*?<\/thead>/i.exec(table)?.[0];
  if (!head) throw new Error('table without a header');
  const days = [...head.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => dayOf(m[1]));
  if (days.length !== 3 || new Set(days).size !== 3) throw new Error(`expected HAFTA İÇİ / CUMARTESİ / PAZAR, got ${days.join(', ')}`);
  const body = /<tbody[\s\S]*?<\/tbody>/i.exec(table)?.[0] ?? '';
  const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]));
  for (const r of rows) if (r.length !== 3) throw new Error(`row with ${r.length} cells`);
  return { days, rows };
}

const CONTINUOUS = /^(\d{1,2}[:.]\d{2})\s*-\s*(\d{1,2}[:.]\d{2})\s+Arası\s+Sürekli\s+Sefer$/i;

function columnsOf(table: string): { columns: DayColumns; continuous: Continuous[] } {
  const { days, rows } = tableColumns(table);
  const raw: DayColumns = { weekday: [], saturday: [], sunday: [] };
  const continuous: Continuous[] = [];
  for (const r of rows)
    r.forEach((cell, i) => {
      const text = squash(cell);
      const c = CONTINUOUS.exec(text);
      if (c) continuous.push({ days: [days[i]], start: clock(c[1])!, end: clock(c[2])! });
      else {
        const t = clock(cell);
        if (t) raw[days[i]].push(t);
      }
    });
  const columns = { weekday: serviceDayTimes(raw.weekday), saturday: serviceDayTimes(raw.saturday), sunday: serviceDayTimes(raw.sunday) };
  return { columns, continuous: continuous.map((w) => ({ ...w, end: w.end < w.start ? fmt(Number(w.end.slice(0, 2)) * 60 + Number(w.end.slice(3)) + 1440) : w.end })) };
}

/** Turyol: GetVarislar2 JSON → offered destinations ({ id, name }), the "Nereye" placeholder dropped. */
export function parseTuryolDestinations(json: string): { id: string; name: string }[] {
  const data = JSON.parse(json) as unknown;
  if (!Array.isArray(data)) throw new Error('destinations: not a list');
  return data
    .filter((d): d is { Key: string; Value: string } => !!d && typeof d.Key === 'string' && typeof d.Value === 'string')
    .filter((d) => d.Key !== '')
    .map((d) => ({ id: d.Key, name: d.Value.trim() }));
}

/** Turyol: the result page of one pier-pair search → its title ("Eminönü İskele Kalkış / Üsküdar") and columns. */
export function parseTuryolTable(html: string): { title: string; columns: DayColumns } {
  const title = /<div[^>]*id="baslikDiv"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  const table = /<table[^>]*id="datatable-responsive"[\s\S]*?<\/table>/i.exec(html);
  if (!title || !table) throw new Error('no timetable on the page (title / table missing)');
  const { columns, continuous } = columnsOf(table[0]);
  if (continuous.length) throw new Error('unexpected "continuous service" cell on a Turyol table');
  return { title: squash(title[1]), columns };
}

/** "Kadıköy Metro İskele Kalkış / Karaköy" → ["Kadıköy Metro", "Karaköy"] (normalised for comparison). */
export function turyolTitlePiers(title: string): [string, string] | null {
  const m = /^(.+?)\s+(?:İskele\s+)?Kalkış\s*\/\s*(.+)$/i.exec(title);
  if (!m) return null;
  const clean = (s: string) => s.replace(/\s+İskele(si)?$/i, '').trim().toLocaleLowerCase('tr');
  return [clean(m[1]), clean(m[2])];
}

/** Next.js RSC payload of a page (the strings pushed with self.__next_f.push([1, "…"])), joined. */
export function rscPayload(html: string): string {
  let out = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) out += JSON.parse(m[1]) as string;
  return out;
}

/** Dentur Avrasya: departure columns of a line page, by printed pier title ("ÜSKÜDAR"). */
export function parseDenturColumns(html: string): { pier: string; columns: DayColumns; continuous: Continuous[] }[] {
  const rsc = rscPayload(html);
  const blocks = [...rsc.matchAll(/<div class="column-title">([\s\S]*?)<\/div>([\s\S]*?<\/table>)/gi)];
  if (!blocks.length) throw new Error('no departure columns on the page');
  return blocks.map((b) => {
    const t = squash(b[1]).toLocaleUpperCase('tr');
    const m = /^(.+?)\s+KALKIŞ$/.exec(t);
    if (!m) throw new Error(`unexpected column title "${t}"`);
    return { pier: m[1], ...columnsOf(b[2]) };
  });
}
