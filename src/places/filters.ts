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

export const ALL_CATEGORIES: Category[] = ['food', 'culture', 'shopping', 'park'];

export const filtersActive = (f: PlaceFilterState) => f.categories.length > 0 || f.openNow || anyEventFilter(f.ev);

export function placeVisible(store: PlacesStore, id: string, f: PlaceFilterState, nowMs: number): boolean {
  if (!store.visible(id, { categories: f.categories, openNow: f.openNow }, nowMs)) return false;
  return !anyEventFilter(f.ev) || events.placeMatches(id, f.ev, nowMs);
}

/** Toggle one category chip; selecting every category is the same as "All" (back to none). */
export function toggleCategory(list: Category[], c: Category): Category[] {
  const next = list.includes(c) ? list.filter((x) => x !== c) : [...list, c];
  return next.length === ALL_CATEGORIES.length ? [] : next;
}

/** Story markers (historic places) belong to Culture; they have no hours or events. */
export const storiesVisible = (f: PlaceFilterState) => !f.openNow && !anyEventFilter(f.ev) && (!f.categories.length || f.categories.includes('culture'));

/** Map POIs from the tiles carry no hours or events: shown unless one of those filters is on. */
export const poisVisible = (f: PlaceFilterState) => !f.openNow && !anyEventFilter(f.ev);
