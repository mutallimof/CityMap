import { describe, expect, it } from 'vitest';
import { NO_EVENT_FILTERS } from '../events/events';
import { chipCount, filtersActive, NO_FILTERS, poisVisible, storiesVisible, toggleCategory } from './filters';

describe('place filters', () => {
  it('chips are plain toggles that combine (no reset when all are on)', () => {
    expect(toggleCategory([], 'shopping')).toEqual(['shopping']);
    expect(toggleCategory(['shopping'], 'culture')).toEqual(['shopping', 'culture']);
    expect(toggleCategory(['shopping', 'culture'], 'shopping')).toEqual(['culture']);
    expect(toggleCategory(['food', 'culture', 'shopping'], 'park')).toEqual(['food', 'culture', 'shopping', 'park']);
    expect(toggleCategory(['food', 'culture', 'shopping', 'park'], 'park')).toEqual(['food', 'culture', 'shopping']);
  });

  it('chip counts: every active filter applies; a category chip counts its own category', () => {
    const cat: Record<string, string> = { a: 'food', b: 'food', c: 'culture', d: 'park' };
    const open = new Set(['a', 'c']);
    const visible = (id: string, f: { categories: string[]; openNow: boolean }) => (!f.categories.length || f.categories.includes(cat[id])) && (!f.openNow || open.has(id));
    const ids = Object.keys(cat);
    const f = { ...NO_FILTERS, categories: ['food', 'culture'] as ('food' | 'culture')[] };
    expect(chipCount(ids, visible as never, f, 'food')).toBe(2);
    expect(chipCount(ids, visible as never, f, 'culture')).toBe(1);
    expect(chipCount(ids, visible as never, { ...f, openNow: true }, 'food')).toBe(1);
    expect(chipCount(ids, visible as never, { ...f, openNow: true })).toBe(2);
    expect(filtersActive(NO_FILTERS)).toBe(false);
  });

  it('default shows everything; stories follow Culture; POIs only hide for hours/event filters', () => {
    const none = { categories: [], openNow: false, ev: NO_EVENT_FILTERS };
    expect(filtersActive(none)).toBe(false);
    expect(storiesVisible(none) && poisVisible(none)).toBe(true);
    expect(storiesVisible({ ...none, categories: ['food'] })).toBe(false);
    expect(storiesVisible({ ...none, categories: ['food', 'culture'] })).toBe(true);
    expect(poisVisible({ ...none, categories: ['food'] })).toBe(true);
    expect(poisVisible({ ...none, ev: { ...NO_EVENT_FILTERS, today: true } })).toBe(false);
  });
});
