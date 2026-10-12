/**
 * Plans in a link (no server): `#plan=1.<base64url(JSON)>`. The JSON is compact — kind, first day,
 * number of days, and per stop [type, ref, day offset, start, duration, name]. Names are kept so a
 * place or event that's gone from our data still shows what it was. Links stay under
 * CONFIG.plan.share.maxChars (names are shortened, then dropped); bigger plans can't be shared.
 * Start / end points (a hotel, a home) are private: only in the link when the sender turns them on
 * (`e` for the plan, `d` per day). Links without them — incl. every link made before they existed —
 * open as a plan that starts at its first stop. Decoding never throws: a broken link gives null.
 */
import { CONFIG } from '../config';
import { addDays, newId, type Plan, type PlanEnds, type PlanKind, type PlanPoint } from './model';

const KINDS: Record<string, PlanKind> = { e: 'evening', d: 'day', m: 'days' };
const KIND_CODE: Record<PlanKind, string> = { evening: 'e', day: 'd', days: 'm' };

/** Point [name, lng, lat]; 0 = none; 1 = same as start (end only). */
type PackedPoint = [string, number, number];
type PackedEnds = { s?: PackedPoint | 0; e?: PackedPoint | 0 | 1 };
type Packed = { k: string; f: string; n: number; s: [number, string, number, number, number, string?, number?, number?][]; e?: PackedEnds; d?: [number, PackedEnds][] };

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

const packPoint = (pt: PlanPoint, nameLen: number): PackedPoint => [pt.name.slice(0, Math.max(nameLen, 12)), Number(pt.ll[0].toFixed(5)), Number(pt.ll[1].toFixed(5))];

function packEnds(e: PlanEnds, nameLen: number): PackedEnds {
  const out: PackedEnds = {};
  if (e.start !== undefined) out.s = e.start ? packPoint(e.start, nameLen) : 0;
  if (e.end !== undefined) out.e = e.end === 'start' ? 1 : e.end ? packPoint(e.end, nameLen) : 0;
  return out;
}

function pack(p: Plan, nameLen: number, withEnds: boolean): string {
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
  if (withEnds && p.ends) packed.e = packEnds(p.ends, nameLen);
  if (withEnds && p.dayEnds) {
    const d = Object.entries(p.dayEnds)
      .map(([day, e]) => [dayIndex(p.from, day), packEnds(e, nameLen)] as [number, PackedEnds])
      .filter(([i]) => i >= 0 && i < packed.n);
    if (d.length) packed.d = d;
  }
  return `1.${b64urlEncode(JSON.stringify(packed))}`;
}

/** Whether a plan has any start / end point to share. */
export const hasEnds = (p: Plan) => !!(p.ends?.start || (p.ends?.end && p.ends.end !== 'start') || Object.values(p.dayEnds ?? {}).some((e) => e.start || (e.end && e.end !== 'start')));

/** The hash payload for a plan, or null if it doesn't fit in a link. Start / end points only when asked. */
export function encodePlan(p: Plan, opts: { ends?: boolean } = {}): string | null {
  if (p.stops.length > CONFIG.plan.share.maxStops) return null;
  for (const len of [40, 20, 0]) {
    const s = pack(p, len, !!opts.ends);
    if (s.length + '#plan='.length <= CONFIG.plan.share.maxChars) return s;
  }
  return null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const inBox = (lng: unknown, lat: unknown) => typeof lng === 'number' && typeof lat === 'number' && lng > 27 && lng < 31 && lat > 40 && lat < 42;

/** Undefined = not in the link; throws on anything malformed (caught by decodePlan). */
function unpackPoint(x: unknown, allowSame: boolean): PlanPoint | 'start' | null | undefined {
  if (x === undefined) return undefined;
  if (x === 0) return null;
  if (x === 1 && allowSame) return 'start';
  if (Array.isArray(x) && x.length === 3 && typeof x[0] === 'string' && x[0].length <= 60 && inBox(x[1], x[2])) return { name: x[0] || '—', ll: [x[1], x[2]] };
  throw new Error('bad point');
}

function unpackEnds(x: unknown): PlanEnds {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error('bad ends');
  const o = x as PackedEnds;
  const out: PlanEnds = {};
  const start = unpackPoint(o.s, false);
  const end = unpackPoint(o.e, true);
  if (start !== undefined) out.start = start as PlanPoint | null;
  if (end !== undefined) out.end = end;
  return out;
}
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
      if (ll && !inBox(ll[0], ll[1])) return null;
      stops.push({ id: newId('s'), kind: r[0] === 1 ? ('event' as const) : ('place' as const), ref: r[1], day: addDays(j.f, r[2]), start: r[3], dur: r[4], ...(r[5] ? { label: r[5].slice(0, 60) } : {}), ...(ll ? { ll: ll as [number, number] } : {}) });
    }
    const plan: Plan = { id: newId('p'), kind: KINDS[j.k], from: j.f, to: addDays(j.f, j.n - 1), stops, created: Date.now() };
    if (j.e !== undefined) plan.ends = unpackEnds(j.e);
    if (j.d !== undefined) {
      if (!Array.isArray(j.d) || j.d.length > CONFIG.plan.maxDays) return null;
      plan.dayEnds = {};
      for (const row of j.d) {
        if (!Array.isArray(row) || !isInt(row[0], 0, j.n - 1)) return null;
        plan.dayEnds[addDays(j.f, row[0])] = unpackEnds(row[1]);
      }
    }
    return plan;
  } catch {
    return null;
  }
}

export const planLink = (payload: string) => `${location.origin}${location.pathname}#plan=${payload}`;
