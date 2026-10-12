/**
 * Theme registry. A theme is one file in src/themes (a ThemeSpec, usually `defineTheme({...})` over
 * Classic) plus one line in THEMES below. The active theme is chosen by `?theme=<id>` (test switch,
 * not saved), else the one saved on this device, else DEFAULT_THEME. `look()` is what drawing code reads.
 */
import { classic } from './classic';
import type { ThemeSpec } from './types';

export const THEMES: ThemeSpec[] = [classic];

export const DEFAULT_THEME = 'classic';
const KEY = 'theme:v1';

export const themeById = (id: string | null | undefined): ThemeSpec | undefined => THEMES.find((t) => t.id === id);

interface Storage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}
const storage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

/** Theme to start with: ?theme= (if known), else the saved one (if known), else the default. */
export function initialThemeId(search: string, store: Storage | null = storage()): string {
  const q = new URLSearchParams(search).get('theme');
  if (themeById(q)) return q!;
  let saved: string | null = null;
  try {
    saved = store?.getItem(KEY) ?? null;
  } catch {
    /* blocked storage */
  }
  return themeById(saved) ? saved! : DEFAULT_THEME;
}

let current: ThemeSpec = themeById(initialThemeId(typeof location === 'undefined' ? '' : location.search)) ?? classic;
const listeners = new Set<(t: ThemeSpec) => void>();

/** The active theme's look. */
export const look = (): ThemeSpec => current;

/** Switch theme (unknown ids are ignored); saved on the device unless `save` is false. Returns the active theme. */
export function setTheme(id: string, opts: { save?: boolean; store?: Storage | null } = {}): ThemeSpec {
  const t = themeById(id);
  if (!t) return current;
  if (opts.save !== false) {
    try {
      (opts.store === undefined ? storage() : opts.store)?.setItem(KEY, id);
    } catch {
      /* storage full / blocked: the choice lasts until the page closes */
    }
  }
  if (t === current) return current;
  current = t;
  for (const fn of listeners) fn(t);
  return t;
}

/** Called after every theme switch. Returns an unsubscribe function. */
export function onTheme(fn: (t: ThemeSpec) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
