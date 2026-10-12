/**
 * HUD state: language, selection, sheet, chips / filters, panels — a tiny observable store with a React hook.
 */
import { useSyncExternalStore } from 'react';
import { NO_EVENT_FILTERS, type EventFilters } from '../events/events';

export type Lang = 'tr' | 'en';
export type Selection = { kind: 'vessel'; id: string } | { kind: 'pier'; id: string } | { kind: 'place'; id: string } | { kind: 'guide'; id: string } | { kind: 'plan'; id: string } | null;
export type Category = 'food' | 'culture' | 'shopping' | 'park';
export type SheetSnap = 'peek' | 'half' | 'full';

export interface UiState {
  lang: Lang;
  selection: Selection;
  follow: boolean;
  /** Map layers toggled by chips. */
  ferries: boolean;
  routes: boolean;
  /** Place categories shown on the map and in the feed (empty = all). */
  categories: Category[];
  /** Only places open right now (by their OSM opening hours). */
  openNow: boolean;
  timePanel: boolean;
  /** Search overlay open. */
  search: boolean;
  /** Map legend popover open. */
  legend: boolean;
  /** Map style (theme) picker open. */
  themes: boolean;
  /** Event chips: only venues with matching events. */
  ev: EventFilters;
  hint: boolean;
  sheetSnap: SheetSnap;
  /** Harbour sounds (off by default; turned on by a tap). */
  sound: boolean;
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'tr' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

type Listener = () => void;

/** Tiny observable store (no framework state library needed for a handful of fields). */
export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      for (const l of listeners) l();
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export const ui = createStore<UiState>({
  lang: initialLang(),
  selection: null,
  follow: false,
  ferries: true,
  routes: true,
  categories: [],
  openNow: false,
  search: false,
  legend: false,
  themes: false,
  ev: NO_EVENT_FILTERS,
  timePanel: false,
  hint: true,
  sheetSnap: 'peek',
  sound: false,
});

export function useUi<S>(select: (s: UiState) => S): S {
  return useSyncExternalStore(ui.subscribe, () => select(ui.get()));
}

export function setLang(lang: Lang): void {
  ui.set({ lang });
  try {
    localStorage.setItem('lang', lang);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = lang;
}
