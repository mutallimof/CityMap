/**
 * Plans on this device (localStorage; nothing leaves the device unless shared as a link). One plan is
 * "active": "Add to plan" adds to it (a new evening plan for today is made when there's none).
 * A plan opened from a shared link is kept separately, read-only, until copied.
 */
import { useSyncExternalStore } from 'react';
import { createStore } from '../ui/store';
import { addEvent, addPlace, createPlan, isoDay, setStart, stopMs, type Plan, type PlanKind } from './model';
import { timelineOf } from './runtime';

const KEY = 'plans:v1';

interface PlanState {
  plans: Plan[];
  active: string | null;
  /** Opened from a link (read-only). */
  shared: Plan | null;
  /** The link couldn't be read. */
  sharedBroken: boolean;
}

function load(): Pick<PlanState, 'plans' | 'active'> {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { plans?: Plan[]; active?: string | null } | null;
    const plans = Array.isArray(j?.plans) ? j!.plans.filter((p) => p && typeof p.id === 'string' && Array.isArray(p.stops)) : [];
    return { plans, active: plans.some((p) => p.id === j?.active) ? j!.active! : (plans[0]?.id ?? null) };
  } catch {
    return { plans: [], active: null };
  }
}

export const planStore = createStore<PlanState>({ ...load(), shared: null, sharedBroken: false });

planStore.subscribe(() => {
  const { plans, active } = planStore.get();
  try {
    localStorage.setItem(KEY, JSON.stringify({ plans, active }));
  } catch {
    /* storage full / blocked: plans live until the page closes */
  }
});

export function usePlans<S>(select: (s: PlanState) => S): S {
  return useSyncExternalStore(planStore.subscribe, () => select(planStore.get()));
}

export const planById = (id: string) => (id === 'shared' ? planStore.get().shared : planStore.get().plans.find((p) => p.id === id)) ?? null;

export function savePlan(p: Plan): void {
  planStore.set((s) => ({ plans: s.plans.some((x) => x.id === p.id) ? s.plans.map((x) => (x.id === p.id ? p : x)) : [p, ...s.plans] }));
}

export function newPlan(kind: PlanKind, from: string, to = from): Plan {
  const p = createPlan(kind, from, to);
  planStore.set((s) => ({ plans: [p, ...s.plans], active: p.id }));
  return p;
}

export function deletePlan(id: string): void {
  planStore.set((s) => {
    const plans = s.plans.filter((p) => p.id !== id);
    return { plans, active: s.active === id ? (plans[0]?.id ?? null) : s.active };
  });
}

export const setActive = (id: string) => planStore.set({ active: id });

/** The active plan, making an evening plan for `today` if there is none. */
export function activePlan(nowMs: number): Plan {
  const s = planStore.get();
  return s.plans.find((p) => p.id === s.active) ?? newPlan('evening', isoDay(nowMs));
}

export function addPlaceToPlan(nowMs: number, ref: string, label: string, category?: string, ll?: [number, number]): Plan {
  let p = addPlace(activePlan(nowMs), ref, label, category, ll);
  // The next free slot doesn't know the way there: if the walk / ferry gets in later, start on arrival.
  const added = p.stops[p.stops.length - 1];
  const late = timelineOf(p)
    .flatMap((d) => d.stops)
    .find((s) => s.stop.id === added.id)
    ?.warnings.find((w) => w.kind === 'late');
  if (late && late.kind === 'late') p = setStart(p, added.id, added.start + Math.ceil((late.arrive - stopMs(added.day, added.start)) / 300_000) * 5);
  savePlan(p);
  return p;
}

export function addEventToPlan(nowMs: number, ev: { id: string; title: string; start: string; end?: string; allDay?: boolean }): Plan {
  const p = addEvent(activePlan(nowMs), ev);
  savePlan(p);
  return p;
}

/** Copy a shared (read-only) plan into my plans and make it active. */
export function copyShared(): Plan | null {
  const sh = planStore.get().shared;
  if (!sh) return null;
  const p = { ...createPlan(sh.kind, sh.from, sh.to), stops: sh.stops.map((s) => ({ ...s })), ...(sh.ends ? { ends: sh.ends } : {}), ...(sh.dayEnds ? { dayEnds: sh.dayEnds } : {}) };
  planStore.set((s) => ({ plans: [p, ...s.plans], active: p.id }));
  return p;
}
