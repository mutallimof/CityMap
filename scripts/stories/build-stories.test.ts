import { describe, expect, it } from 'vitest';
import { storyKind, trimSummary, yearOf } from './build-stories';

describe('stories helpers', () => {
  it('classifies OSM features', () => {
    expect(storyKind({ amenity: 'place_of_worship', religion: 'muslim' })).toBe('mosque');
    expect(storyKind({ tourism: 'museum' })).toBe('museum');
    expect(storyKind({ man_made: 'tower' })).toBe('tower');
    expect(storyKind({ historic: 'castle' })).toBe('fortress');
    expect(storyKind({ historic: 'memorial' })).toBeNull();
    expect(storyKind({ shop: 'bakery' })).toBeNull();
  });
  it('reads the inception year', () => {
    expect(yearOf({ claims: { P571: [{ mainsnak: { datavalue: { value: { time: '+1348-00-00T00:00:00Z' } } } }] } })).toBe(1348);
    expect(yearOf({})).toBeNull();
  });
  it('trims summaries at sentence ends', () => {
    const s = 'One sentence here. ' + 'Second sentence is long. '.repeat(60);
    const t = trimSummary(s, 120);
    expect(t.length).toBeLessThanOrEqual(120);
    expect(t.endsWith('.')).toBe(true);
  });
});
