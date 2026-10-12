import { anyEventFilter, events, type EventFilters } from '../events/events';
import type { Category } from '../ui/store';
import type { PlacesStore } from './store';

/**
 * One visibility rule for the map pins, the feed and the "N places" hint. Filters combine:
 *   categories — on/off chips, any of them (none = all);
 *   open now   — only places whose known opening hours say open;
 *   event chips — only venues with a matching event (Today / This weekend / Workshops / Free).
 */
export interface PlaceFilterState {
  categories: Category[];
  openNow: boolean;
  ev: EventFilters;
}

export const filtersActive = (f: PlaceFilterState) => f.categories.length > 0 || f.openNow || anyEventFilter(f.ev);

export function placeVisible(store: PlacesStore, id: string, f: PlaceFilterState, nowMs: number): boolean {
  if (!store.visible(id, { categories: f.categories, openNow: f.openNow }, nowMs)) return false;
  return !anyEventFilter(f.ev) || events.placeMatches(id, f.ev, nowMs);
}

/** Toggle one category chip on / off (several can be on; none = everything). Plain toggles, no resets. */
export function toggleCategory(list: Category[], c: Category): Category[] {
  return list.includes(c) ? list.filter((x) => x !== c) : [...list, c];
}

export const NO_FILTERS: PlaceFilterState = { categories: [], openNow: false, ev: { today: false, weekend: false, workshops: false, free: false } };

/**
 * The number an active chip shows: places that pass every active filter — for a category chip, only
 * that category's share (so two category chips each show their own count).
 */
export function chipCount(ids: readonly string[], visible: (id: string, f: PlaceFilterState) => boolean, f: PlaceFilterState, category?: Category): number {
  const g = category ? { ...f, categories: [category] } : f;
  let n = 0;
  for (const id of ids) if (visible(id, g)) n++;
  return n;
}

/** Story markers (historic places) belong to Culture; they have no hours or events. */
export const storiesVisible = (f: PlaceFilterState) => !f.openNow && !anyEventFilter(f.ev) && (!f.categories.length || f.categories.includes('culture'));

/** Map POIs from the tiles carry no hours or events: shown unless one of those filters is on. */
export const poisVisible = (f: PlaceFilterState) => !f.openNow && !anyEventFilter(f.ev);
