import { describe, expect, it } from 'vitest';
import { NO_EVENT_FILTERS } from '../events/events';
import { filtersActive, poisVisible, storiesVisible, toggleCategory } from './filters';

describe('place filters', () => {
  it('chips combine and "all of them" resets to All', () => {
    expect(toggleCategory([], 'shopping')).toEqual(['shopping']);
    expect(toggleCategory(['shopping'], 'culture')).toEqual(['shopping', 'culture']);
    expect(toggleCategory(['shopping', 'culture'], 'shopping')).toEqual(['culture']);
    expect(toggleCategory(['food', 'culture', 'shopping'], 'park')).toEqual([]);
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
