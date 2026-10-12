/**
 * Plans: places and events the visitor picked, on one evening, one day or several days. Pure data +
 * edits (no UI, no storage) so the timeline rules are testable. Times are minutes since the stop's
 * plan day midnight (Istanbul); an evening can run past midnight (≥ 1440 = after midnight).
 */
import { CONFIG } from '../config';

export type PlanKind = 'evening' | 'day' | 'days';

export interface PlanStop {
  /** Unique within the plan. */
  id: string;
  kind: 'place' | 'event';
  /** Place id (featured place or map POI) or event id. */
  ref: string;
  /** Plan day "YYYY-MM-DD" (Istanbul) the stop belongs to. */
  day: string;
  /** Minutes since that day's midnight (may exceed 1440 after midnight). */
  start: number;
  /** Minutes. */
  dur: number;
  /** Name when added — shown if the place / event is no longer in our data. */
  label?: string;
  /** OSM position of a map POI that isn't a featured place (so it survives a reload). */
  ll?: [number, number];
}

/** A start or end point (hotel, home…): what the visitor picked — search result, map tap or their location. */
export interface PlanPoint {
  name: string;
  ll: [number, number];
}

/**
 * Where the days start and end. `start`: a point, or null/absent = none. `end`: a point, 'start' =
 * same as the start (the default when absent), or null = none.
 */
export interface PlanEnds {
  start?: PlanPoint | null;
  end?: PlanPoint | 'start' | null;
}

export interface Plan {
  id: string;
  kind: PlanKind;
  /** First and last day ("YYYY-MM-DD"); equal for an evening or a day. */
  from: string;
  to: string;
  stops: PlanStop[];
  created: number;
  /** Start / end of every day (optional). */
  ends?: PlanEnds;
  /** Per-day changes: a field set here (incl. null = none that day) overrides `ends` for that day. */
  dayEnds?: Record<string, PlanEnds>;
}

const DAY_MS = 86_400_000;
const OFFSET_MS = 3 * 3_600_000;

/** Istanbul date of an epoch ms. */
export function isoDay(ms: number): string {
  return new Date(ms + OFFSET_MS).toISOString().slice(0, 10);
}

/** Epoch ms of minute `min` of a plan day. */
export function stopMs(day: string, min: number): number {
  return Date.parse(`${day}T00:00:00Z`) - OFFSET_MS + min * 60_000;
}

export const startOf = (s: PlanStop) => stopMs(s.day, s.start);
export const endOf = (s: PlanStop) => stopMs(s.day, s.start + s.dur);

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Every day of a plan, in order. */
export function planDays(p: Pick<Plan, 'from' | 'to'>): string[] {
  const out: string[] = [];
  for (let d = p.from; d <= p.to && out.length < CONFIG.plan.maxDays; d = addDays(d, 1)) out.push(d);
  return out;
}

let seq = 0;
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export function createPlan(kind: PlanKind, from: string, to = from, now = Date.now()): Plan {
  const last = kind === 'days' && to > from ? to : from;
  return { id: newId('p'), kind, from, to: last, stops: [], created: now };
}

/** Stops in time order (day, then start; ties keep insertion order). */
export function sortedStops(p: Plan): PlanStop[] {
  return p.stops.map((s, i) => [s, i] as const).sort((a, b) => startOf(a[0]) - startOf(b[0]) || a[1] - b[1]).map(([s]) => s);
}

/** Default first start of a plan day (evening 18:00, otherwise 10:00). */
const firstStart = (kind: PlanKind) => (kind === 'evening' ? CONFIG.plan.eveningStartMin : CONFIG.plan.dayStartMin);

const roundUp = (min: number, step: number) => Math.ceil(min / step) * step;

/**
 * Next free slot for a new place: after the last stop of the plan's last used day (plus a gap for
 * getting there), else the day's default start.
 */
export function nextSlot(p: Plan, dur: number): { day: string; start: number } {
  const stops = sortedStops(p);
  if (!stops.length) return { day: p.from, start: firstStart(p.kind) };
  const last = stops[stops.length - 1];
  const day = last.day >= p.from && last.day <= p.to ? last.day : p.from;
  const ends = stops.filter((s) => s.day === day).map((s) => s.start + s.dur);
  const start = roundUp(Math.max(...ends) + CONFIG.plan.gapMin, 15);
  // Past the end of a day plan → the next day of a several-day plan, if there is one.
  if (p.kind === 'days' && start + dur > CONFIG.plan.dayEndMin && day < p.to) return { day: addDays(day, 1), start: firstStart(p.kind) };
  return { day, start };
}

/** Default length of a visit by place category (minutes). */
function placeDuration(category: string | undefined): number {
  const d = CONFIG.plan.placeMinutes as Record<string, number>;
  return d[category ?? ''] ?? d.default;
}

/** Whether a place is already a stop of the plan. */
export const hasPlace = (p: Plan, ref: string): boolean => p.stops.some((s) => s.kind === 'place' && s.ref === ref);

/** Adds a place at the next free slot; a place already in the plan is not added twice (plan returned as is). */
export function addPlace(p: Plan, ref: string, label: string, category?: string, ll?: [number, number]): Plan {
  if (hasPlace(p, ref)) return p;
  const dur = placeDuration(category);
  const slot = nextSlot(p, dur);
  return { ...p, stops: [...p.stops, { id: newId('s'), kind: 'place', ref, label, dur, ...slot, ...(ll ? { ll } : {}) }] };
}

/**
 * An event keeps its real start. It's put on the plan day it falls on; an event in the small hours
 * after the plan's last evening belongs to that evening (start ≥ 1440).
 */
export function addEvent(p: Plan, ev: { id: string; title: string; start: string; end?: string; allDay?: boolean }): Plan {
  const s = Date.parse(ev.start);
  let day = isoDay(s);
  let start = Math.round((s - stopMs(day, 0)) / 60_000);
  const prev = addDays(day, -1);
  if (start < CONFIG.plan.nightUntilMin && prev >= p.from && prev <= p.to && !(day >= p.from && day <= p.to)) {
    day = prev;
    start += 1440;
  }
  const endMs = ev.end ? Date.parse(ev.end) : s + CONFIG.plan.eventDefaultMin * 60_000;
  const dur = ev.allDay ? CONFIG.plan.allDayMinutes : Math.max(15, Math.min(CONFIG.plan.eventMaxMin, Math.round((endMs - s) / 60_000)));
  if (ev.allDay) start = Math.max(start, firstStart(p.kind));
  return { ...p, stops: [...p.stops, { id: newId('s'), kind: 'event', ref: ev.id, label: ev.title, day, start, dur }] };
}

export function removeStop(p: Plan, id: string): Plan {
  return { ...p, stops: p.stops.filter((s) => s.id !== id) };
}

/** A place's start time (events keep theirs). */
export function setStart(p: Plan, id: string, start: number, day?: string): Plan {
  return { ...p, stops: p.stops.map((s) => (s.id === id && s.kind === 'place' ? { ...s, start: Math.max(0, Math.min(1440 + CONFIG.plan.nightUntilMin, start)), ...(day ? { day } : {}) } : s)) };
}

export function setDuration(p: Plan, id: string, dur: number): Plan {
  return { ...p, stops: p.stops.map((s) => (s.id === id ? { ...s, dur: Math.max(5, Math.min(24 * 60, dur)) } : s)) };
}

/**
 * Move a place one step earlier (-1) or later (+1) in the timeline. Swapping with another place swaps
 * their times; next to an event (fixed time) the place goes to the other side of it. Events don't move.
 */
export function moveStop(p: Plan, id: string, dir: -1 | 1): Plan {
  const list = sortedStops(p);
  const i = list.findIndex((s) => s.id === id);
  const s = list[i];
  const n = list[i + dir];
  if (!s || !n || s.kind !== 'place' || n.day !== s.day) return p;
  if (n.kind === 'place') {
    return { ...p, stops: p.stops.map((x) => (x.id === s.id ? { ...x, start: n.start } : x.id === n.id ? { ...x, start: s.start } : x)) };
  }
  const start = dir < 0 ? n.start - s.dur - CONFIG.plan.gapMin : n.start + n.dur + CONFIG.plan.gapMin;
  return setStart(p, id, roundUp(Math.max(0, start), 5));
}

/** A day's start and end point: the day's own change, else the plan's; end "same as start" follows that day's start. */
export function endsOf(p: Pick<Plan, 'ends' | 'dayEnds'>, day: string): { start: PlanPoint | null; end: PlanPoint | null; custom: boolean } {
  const o = p.dayEnds?.[day];
  const start = o && o.start !== undefined ? o.start : (p.ends?.start ?? null);
  const end = o && o.end !== undefined ? o.end : p.ends?.end === undefined ? 'start' : p.ends.end;
  return { start, end: end === 'start' ? start : end, custom: !!o && (o.start !== undefined || o.end !== undefined) };
}

/** Change the plan's start / end (every day), or only one day's when `day` is given. */
export function setEnds(p: Plan, patch: PlanEnds, day?: string): Plan {
  if (!day) return { ...p, ends: { ...p.ends, ...patch } };
  return { ...p, dayEnds: { ...p.dayEnds, [day]: { ...p.dayEnds?.[day], ...patch } } };
}

/** Back to the plan's start / end for that day. */
export function resetDayEnds(p: Plan, day: string): Plan {
  if (!p.dayEnds?.[day]) return p;
  const { [day]: _, ...rest } = p.dayEnds;
  return { ...p, dayEnds: Object.keys(rest).length ? rest : undefined };
}

/** "18:30", or "00:30 (+1)" after midnight. */
export function fmtMin(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const s = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return min >= 1440 ? `${s} (+1)` : s;
}
