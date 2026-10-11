/**
 * Plans in a link (no server): `#plan=1.<base64url(JSON)>`. The JSON is compact — kind, first day,
 * number of days, and per stop [type, ref, day offset, start, duration, name]. Names are kept so a
 * place or event that's gone from our data still shows what it was. Links stay under
 * CONFIG.plan.share.maxChars (names are shortened, then dropped); bigger plans can't be shared.
 * Decoding never throws: a broken or unknown link gives null.
 */
import { CONFIG } from '../config';
import { addDays, newId, type Plan, type PlanKind } from './model';

const KINDS: Record<string, PlanKind> = { e: 'evening', d: 'day', m: 'days' };
const KIND_CODE: Record<PlanKind, string> = { evening: 'e', day: 'd', days: 'm' };

type Packed = { k: string; f: string; n: number; s: [number, string, number, number, number, string?, number?, number?][] };

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const dayIndex = (from: string, day: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

function pack(p: Plan, nameLen: number): string {
  const packed: Packed = {
    k: KIND_CODE[p.kind],
    f: p.from,
    n: dayIndex(p.from, p.to) + 1,
    s: p.stops.map((s) => {
      const row: Packed['s'][number] = [s.kind === 'event' ? 1 : 0, s.ref, dayIndex(p.from, s.day), s.start, s.dur];
      if ((nameLen > 0 && s.label) || s.ll) row.push(nameLen > 0 && s.label ? s.label.slice(0, nameLen) : '');
      if (s.ll) row.push(Number(s.ll[0].toFixed(5)), Number(s.ll[1].toFixed(5)));
      return row;
    }),
  };
  return `1.${b64urlEncode(JSON.stringify(packed))}`;
}

/** The hash payload for a plan, or null if it doesn't fit in a link. */
export function encodePlan(p: Plan): string | null {
  if (p.stops.length > CONFIG.plan.share.maxStops) return null;
  for (const len of [40, 20, 0]) {
    const s = pack(p, len);
    if (s.length + '#plan='.length <= CONFIG.plan.share.maxChars) return s;
  }
  return null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isInt = (x: unknown, lo: number, hi: number): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;

/** A shared plan from its hash payload, or null when the link is broken / from an unknown version. */
export function decodePlan(payload: string): Plan | null {
  try {
    const m = /^1\.([A-Za-z0-9_-]+)$/.exec(payload.trim());
    if (!m) return null;
    const j = JSON.parse(b64urlDecode(m[1])) as Packed;
    if (!j || typeof j !== 'object' || !KINDS[j.k] || !ISO.test(j.f) || Number.isNaN(Date.parse(j.f)) || !isInt(j.n, 1, CONFIG.plan.maxDays) || !Array.isArray(j.s)) return null;
    if (j.s.length > CONFIG.plan.share.maxStops) return null;
    const stops = [];
    for (const r of j.s) {
      if (!Array.isArray(r) || (r[0] !== 0 && r[0] !== 1) || typeof r[1] !== 'string' || !r[1] || r[1].length > 120) return null;
      if (!isInt(r[2], 0, j.n - 1) || !isInt(r[3], 0, 1440 + CONFIG.plan.nightUntilMin) || !isInt(r[4], 1, 24 * 60)) return null;
      if (r[5] !== undefined && typeof r[5] !== 'string') return null;
      const ll = r[6] !== undefined || r[7] !== undefined ? [r[6], r[7]] : null;
      if (ll && !(typeof ll[0] === 'number' && typeof ll[1] === 'number' && ll[0] > 27 && ll[0] < 31 && ll[1] > 40 && ll[1] < 42)) return null;
      stops.push({ id: newId('s'), kind: r[0] === 1 ? ('event' as const) : ('place' as const), ref: r[1], day: addDays(j.f, r[2]), start: r[3], dur: r[4], ...(r[5] ? { label: r[5].slice(0, 60) } : {}), ...(ll ? { ll: ll as [number, number] } : {}) });
    }
    return { id: newId('p'), kind: KINDS[j.k], from: j.f, to: addDays(j.f, j.n - 1), stops, created: Date.now() };
  } catch {
    return null;
  }
}

export const planLink = (payload: string) => `${location.origin}${location.pathname}#plan=${payload}`;
