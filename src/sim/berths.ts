/**
 * Docking slots: when several vessels are at one berth at the same time they moor abreast — the
 * first at the quay (slot 0), the next hull to hull outside it (slot 1), and so on. Each stay takes
 * the lowest slot free when it arrives and keeps it until it leaves (no shuffling). Occupancy is
 * padded on both sides so an arriving vessel never heads for the slot of one still pulling out.
 * Lines at different OSM berths of a pier (Eminönü, Beşiktaş) already dock apart; slots are per berth.
 *
 * A vessel can't swing round on the spot with another one moored next to it: a turn (alongside
 * after arriving, out before leaving) whose window meets another stay at the berth is "tight", and
 * fleet.ts does that turn while sailing in / out instead.
 *
 * Pure: f(schedules, berths). A day's stays also see the previous service day's stays that run past
 * midnight, with the slots that day gives them on its own (so a vessel never changes slot when the
 * clock passes midnight), and the next day's early stays for tight turns.
 */
import type { LinePath } from './path';
import { DAY_S } from './time';
import type { DaySchedule, Segment } from './types';

type Dock = Extract<Segment, { kind: 'dock' }>;

export interface DockInfo {
  slot: number;
  /** Another vessel is at the berth during the arrival / departure turn. */
  tightIn: boolean;
  tightOut: boolean;
  /**
   * A vessel is moored OUTSIDE this one (higher slot) when it arrives / leaves: it can't cross that hull,
   * so it slides in / out along the quay first (fleet.ts).
   */
  blockedIn: boolean;
  blockedOut: boolean;
}

export interface SlotParams {
  /** Reserved before an arrival and after a departure (sim s). */
  padS: number;
  /** Length of the docking turn window (sim s). */
  turnS: number;
}

interface Stay {
  seg: Dock;
  berth: string;
  vessel: string;
  /** Times on the clock of the schedule being assigned. */
  t0: number;
  t1: number;
}

const berthKey = (paths: Map<string, LinePath>, lineId: string, stop: number) => paths.get(lineId)?.berths?.[stop]?.berthId ?? `${lineId}#${stop}`;

function staysOf(s: DaySchedule, paths: Map<string, LinePath>, shift = 0): Stay[] {
  const out: Stay[] = [];
  for (const v of s.vessels)
    for (const seg of v.segments) if (seg.kind === 'dock') out.push({ seg, berth: berthKey(paths, v.lineId, seg.stopIndex), vessel: v.id, t0: seg.t0 + shift, t1: seg.t1 + shift });
  return out.sort((a, b) => a.t0 - b.t0 || (a.vessel < b.vessel ? -1 : a.vessel > b.vessel ? 1 : 0));
}

/** Greedy lowest-free-slot assignment over one schedule; `carry` = earlier stays already holding slots. */
export function assignSlots(s: DaySchedule, paths: Map<string, LinePath>, padS: number, carry: { berth: string; t1: number; slot: number }[] = []): Map<Segment, number> {
  const slots = new Map<Segment, number>();
  const held = new Map<string, { t1: number; slot: number }[]>();
  for (const c of carry) held.set(c.berth, [...(held.get(c.berth) ?? []), c]);
  for (const st of staysOf(s, paths)) {
    // Another stay blocks its slot while their padded intervals overlap: o.t1 + pad > t0 − pad.
    const list = (held.get(st.berth) ?? []).filter((h) => h.t1 + padS > st.t0 - padS);
    const used = new Set(list.map((h) => h.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    slots.set(st.seg, slot);
    list.push({ t1: st.t1, slot });
    held.set(st.berth, list);
  }
  return slots;
}

const own = new WeakMap<DaySchedule, Map<Segment, number>>();
const full = new WeakMap<DaySchedule, Map<Segment, DockInfo>>();

function ownSlots(s: DaySchedule, paths: Map<string, LinePath>, padS: number) {
  let r = own.get(s);
  if (!r) own.set(s, (r = assignSlots(s, paths, padS)));
  return r;
}

/** Slot and tight turns of every dock stay in `day`'s schedule (cached per schedule object). */
export function daySlots(getDay: (day: number) => DaySchedule, day: number, paths: Map<string, LinePath>, p: SlotParams): Map<Segment, DockInfo> {
  const s = getDay(day);
  const cached = full.get(s);
  if (cached) return cached;
  const prev = getDay(day - 1);
  const prevOwn = ownSlots(prev, paths, p.padS);
  const before = staysOf(prev, paths, -DAY_S).filter((st) => st.t1 + 2 * p.padS > 0);
  const slots = assignSlots(
    s,
    paths,
    p.padS,
    before.map((st) => ({ berth: st.berth, t1: st.t1, slot: prevOwn.get(st.seg)! })),
  );
  const mine = staysOf(s, paths);
  const end = mine.reduce((m, x) => Math.max(m, x.t1), 0);
  const after = staysOf(getDay(day + 1), paths, DAY_S).filter((st) => st.t0 - 2 * p.padS < end);
  const byBerth = new Map<string, Stay[]>();
  for (const st of [...before, ...mine, ...after]) {
    const list = byBerth.get(st.berth);
    if (list) list.push(st);
    else byBerth.set(st.berth, [st]);
  }
  const r = new Map<Segment, DockInfo>();
  const slotOf = (o: Stay) => slots.get(o.seg) ?? prevOwn.get(o.seg);
  for (const st of mine) {
    const others = byBerth.get(st.berth)!.filter((o) => o !== st);
    const meets = (a: number, b: number) => others.some((o) => o.t0 - p.padS < b && o.t1 + p.padS > a);
    const slot = slots.get(st.seg)!;
    // Moored outside this stay at time t (slot known: this day's and the carried-in previous day's stays).
    const outside = (t: number) => others.some((o) => o.t0 - p.padS < t && o.t1 + p.padS > t && (slotOf(o) ?? -1) > slot);
    r.set(st.seg, { slot, tightIn: meets(st.t0, st.t0 + p.turnS), tightOut: meets(st.t1 - p.turnS, st.t1), blockedIn: outside(st.t0), blockedOut: outside(st.t1) });
  }
  full.set(s, r);
  return r;
}
