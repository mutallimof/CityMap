import { describe, expect, it } from 'vitest';
import { fromIstanbul } from '../sim/time';
import { distanceM, PlacesStore } from './store';
import type { RawPost } from './types';

const fc = {
  type: 'FeatureCollection' as const,
  features: [
    { type: 'Feature' as const, properties: { id: 'th', name: 'Theatre', nameEn: null, category: 'culture' as const, kind: 'theatre', osm: 'node/1', district: null, hours: null, cuisine: null }, geometry: { type: 'Point' as const, coordinates: [29, 41] } },
    { type: 'Feature' as const, properties: { id: 'cafe', name: 'Cafe', nameEn: null, category: 'food' as const, kind: 'cafe', osm: 'node/2', district: null, hours: null, cuisine: null }, geometry: { type: 'Point' as const, coordinates: [29.01, 41] } },
  ],
};
const t = { tr: '', en: '' };
const raw: RawPost[] = [
  { id: 'a', placeId: 'th', type: 'event', start: '20:30', durationMin: 120, postedHoursAgo: 2, title: t, body: t, demo: true },
  { id: 'b', placeId: 'cafe', type: 'offer', validDays: 2, postedHoursAgo: 30, title: t, body: t, demo: true },
  { id: 'c', placeId: 'ghost', type: 'news', postedHoursAgo: 1, title: t, body: t, demo: true },
];
const now = fromIstanbul({ day: 20_000, seconds: 19 * 3600 });

describe('PlacesStore', () => {
  it('drops posts for unknown places and tracks per-place state', () => {
    const s = new PlacesStore(fc, raw);
    s.update(now, true);
    expect(s.posts.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(s.state.get('th')).toMatchObject({ newCount: 1, tonight: true, hasEvent: true, soon: true });
    expect(s.state.get('cafe')).toMatchObject({ newCount: 0, tonight: false });
  });

  it('filters the feed by category, events and tonight', () => {
    const s = new PlacesStore(fc, raw);
    s.update(now, true);
    expect(s.feed(now, { categories: ['food'], tonight: false, saved: false }).map((p) => p.id)).toEqual(['b']);
    expect(s.feed(now, { categories: ['events'], tonight: false, saved: false }).map((p) => p.id)).toEqual(['a']);
    expect(s.feed(now, { categories: [], tonight: true, saved: false }).map((p) => p.id)).toEqual(['a']);
    expect(s.placeVisible('cafe', { categories: ['culture'], tonight: false })).toBe(false);
  });

  it('measures distances', () => {
    expect(distanceM([29, 41], [29, 41.01])).toBeCloseTo(1112, -1);
  });
});
