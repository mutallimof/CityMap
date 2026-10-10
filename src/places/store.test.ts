import { describe, expect, it } from 'vitest';
import { fromIstanbul } from '../sim/time';
import { detailsFrom, distanceM, matchesCategory, PlacesStore } from './store';

const base = { nameEn: null, district: null, cuisine: null };
const fc = {
  type: 'FeatureCollection' as const,
  features: [
    { type: 'Feature' as const, properties: { ...base, id: 'th', name: 'Theatre', category: 'culture' as const, kind: 'theatre', osm: 'node/1', hours: null }, geometry: { type: 'Point' as const, coordinates: [29, 41] } },
    { type: 'Feature' as const, properties: { ...base, id: 'cafe', name: 'Cafe', category: 'food' as const, kind: 'cafe', osm: 'node/2', hours: 'Mo-Su 08:00-20:00' }, geometry: { type: 'Point' as const, coordinates: [29.01, 41] } },
    { type: 'Feature' as const, properties: { ...base, id: 'view', name: 'View', category: 'view' as const, kind: 'viewpoint', osm: 'node/3', hours: null }, geometry: { type: 'Point' as const, coordinates: [29.02, 41] } },
  ],
};

describe('places store', () => {
  const s = new PlacesStore(fc);
  const noon = fromIstanbul({ day: 20_000, seconds: 12 * 3600 });
  const night = fromIstanbul({ day: 20_000, seconds: 22 * 3600 });

  it('filters by category chips (parks include viewpoints)', () => {
    expect(s.visible('th', { categories: ['food'], openNow: false }, noon)).toBe(false);
    expect(s.visible('cafe', { categories: ['food'], openNow: false }, noon)).toBe(true);
    expect(matchesCategory('view', ['park'])).toBe(true);
    expect(matchesCategory('food', [])).toBe(true);
  });

  it('open now needs real opening hours', () => {
    expect(s.visible('cafe', { categories: [], openNow: true }, noon)).toBe(true);
    expect(s.visible('cafe', { categories: [], openNow: true }, night)).toBe(false);
    expect(s.visible('th', { categories: [], openNow: true }, noon)).toBe(false); // hours unknown
  });

  it('adds tapped map places once', () => {
    const p = { ...base, id: 'osm:node/9', name: 'X', category: 'food' as const, kind: 'cafe', osm: 'node/9', hours: null, lngLat: [29, 41] as [number, number], source: 'osm' as const };
    expect(s.add(p)).toBe(p);
    expect(s.add({ ...p, name: 'Y' }).name).toBe('X');
  });

  it('reads details from OSM tags, hiding nothing that is missing', () => {
    const d = detailsFrom({ extratags: { opening_hours: '24/7', 'contact:website': 'example.org' }, address: { suburb: 'Moda' } });
    expect(d).toMatchObject({ hours: '24/7', website: 'https://example.org', phone: null, district: 'Moda' });
  });

  it('distance', () => {
    expect(distanceM([29, 41], [29.01, 41])).toBeCloseTo(839, -1);
  });
});
