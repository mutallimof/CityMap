import { describe, expect, it } from 'vitest';
import { classify, goodEnough, score, spread } from './build-featured';

describe('auto-featured places', () => {
  it('classifies and scores by useful details', () => {
    expect(classify({ amenity: 'pub' })).toEqual({ category: 'food', kind: 'bar' });
    expect(classify({ tourism: 'gallery' })).toEqual({ category: 'culture', kind: 'gallery' });
    expect(classify({ amenity: 'bank' })).toBeNull();
    expect(score({ opening_hours: 'Mo-Su 09:00-22:00', website: 'x', cuisine: 'turkish' })).toBe(6.5);
  });

  it('skips chains, fast food and places with too little detail', () => {
    expect(goodEnough({ name: 'X', opening_hours: 'a', website: 'b' }, 'food')).toBe(true);
    expect(goodEnough({ name: 'X', opening_hours: 'a' }, 'food')).toBe(false);
    expect(goodEnough({ name: 'X', opening_hours: 'a', website: 'b', brand: 'Starbucks' }, 'food')).toBe(false);
    expect(goodEnough({ name: 'Park', wikidata: 'Q1' }, 'park')).toBe(true);
    expect(goodEnough({ name: 'Kadıköy Belediyesi', wikidata: 'Q1' }, 'park')).toBe(false);
  });

  it('spreads picks over grid cells before taking seconds from busy ones', () => {
    const items = [
      { cell: 'a', score: 9, id: 1 },
      { cell: 'a', score: 8, id: 2 },
      { cell: 'a', score: 7, id: 3 },
      { cell: 'b', score: 2, id: 4 },
      { cell: 'c', score: 1, id: 5 },
    ];
    expect(spread(items, 3).map((x) => x.id)).toEqual([1, 4, 5]);
    expect(spread(items, 4).map((x) => x.id)).toEqual([1, 4, 5, 2]);
  });
});
