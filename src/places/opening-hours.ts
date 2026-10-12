/**
 * Minimal OSM `opening_hours` evaluator for the common forms:
 *   "24/7" · "Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off" · "Mo-Su 08:00-02:00" (past midnight)
 *   "Tu-Su 10:00-12:00,13:00-19:00" · "10:00-22:00" (no days = every day) · "PH off" (ignored)
 * Later rules override earlier ones for the days they name (OSM semantics). Anything it can't
 * parse yields "unknown" — we show the raw string instead of guessing.
 */
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export type OpenState = 'open' | 'closed' | 'unknown';

export interface OpenStatus {
  state: OpenState;
  /** Minutes since midnight when it closes (open) or opens next today (closed), if known. */
  until?: number;
}

interface Rule {
  days: boolean[];
  ranges: [number, number][]; // minutes; end may exceed 1440 (past midnight)
  off: boolean;
}

function parseTime(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function parseDays(s: string): boolean[] | null {
  const out = Array(7).fill(false);
  for (const part of s.split(',')) {
    const r = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(part.trim());
    if (!r) return null;
    const a = DAYS.indexOf(r[1]);
    const b = r[2] ? DAYS.indexOf(r[2]) : a;
    for (let i = a; ; i = (i + 1) % 7) {
      out[i] = true;
      if (i === b) break;
    }
  }
  return out;
}

function parseOpeningHours(src: string): Rule[] | null {
  const text = src.trim();
  if (text === '24/7') return [{ days: Array(7).fill(true), ranges: [[0, 1440]], off: false }];
  const rules: Rule[] = [];
  for (const raw of text.split(';')) {
    const part = raw.trim();
    if (!part) continue;
    if (/^PH\b/.test(part) || /^SH\b/.test(part)) continue; // holidays: ignore
    const m = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?,?)+)?\s*(.*)$/.exec(part);
    if (!m) return null;
    const days = m[1] ? parseDays(m[1].replace(/,$/, '')) : Array(7).fill(true);
    if (!days) return null;
    const rest = m[2].trim();
    if (rest === 'off' || rest === 'closed') {
      rules.push({ days, ranges: [], off: true });
      continue;
    }
    const ranges: [number, number][] = [];
    for (const span of rest.split(',')) {
      const t = span.trim();
      const plus = /^(\d{1,2}:\d{2})\+$/.exec(t);
      if (plus) {
        ranges.push([parseTime(plus[1])!, 1440]);
        continue;
      }
      const [a, b] = t.split('-');
      const s = a !== undefined ? parseTime(a) : null;
      const e = b !== undefined ? parseTime(b) : null;
      if (s === null || e === null) return null;
      ranges.push([s, e <= s ? e + 1440 : e]);
    }
    rules.push({ days, ranges, off: false });
  }
  return rules.length ? rules : null;
}

/** Effective ranges for one weekday (0 = Monday), after later rules override earlier ones. */
function rangesFor(rules: Rule[], day: number): [number, number][] {
  let out: [number, number][] = [];
  for (const r of rules) if (r.days[day]) out = r.off ? [] : r.ranges;
  return out;
}

/** Open/closed at `weekday` (0 = Monday) and `minutes` since local midnight. */
export function openStatus(src: string | undefined, weekday: number, minutes: number): OpenStatus {
  if (!src) return { state: 'unknown' };
  const rules = parseOpeningHours(src);
  if (!rules) return { state: 'unknown' };
  for (const [s, e] of rangesFor(rules, weekday)) if (minutes >= s && minutes < e) return { state: 'open', until: e % 1440 };
  // Yesterday's ranges running past midnight.
  for (const [s, e] of rangesFor(rules, (weekday + 6) % 7)) if (e > 1440 && minutes + 1440 >= s && minutes + 1440 < e) return { state: 'open', until: e - 1440 };
  const later = rangesFor(rules, weekday)
    .map(([s]) => s)
    .filter((s) => s > minutes)
    .sort((a, b) => a - b)[0];
  return { state: 'closed', until: later };
}
