import { describe, expect, it } from 'vitest';
import { matchDistrict, matchPier } from './match-places';
import { normName, type OverpassElement } from './overpass';

// Synthetic fixtures — coordinates are arbitrary test values, not real places.
const els: OverpassElement[] = [
  { type: 'node', id: 1, lat: 1, lon: 1, tags: { amenity: 'ferry_terminal', name: 'Kadıköy İskelesi', operator: 'Şehir Hatları' } },
  { type: 'node', id: 2, lat: 1.0001, lon: 1, tags: { amenity: 'ferry_terminal', name: 'Kadıköy Turyol İskelesi' } },
  { type: 'way', id: 3, tags: { man_made: 'pier', name: 'Kadıköy Pier' }, geometry: [{ lat: 1, lon: 1.0002 }, { lat: 1, lon: 1.0004 }] },
  { type: 'node', id: 4, lat: 5, lon: 5, tags: { name: 'Kadıköy', place: 'town' } },
  { type: 'node', id: 5, lat: 6, lon: 6, tags: { name: 'Kadıköy', place: 'suburb' } },
  { type: 'node', id: 6, lat: 7, lon: 7, tags: { amenity: 'cafe', name: 'Kadıköy Kahvecisi' } },
  { type: 'node', id: 7, lat: 2, lon: 2, tags: { amenity: 'ferry_terminal', name: 'Rumelikavağı İskelesi' } },
];

describe('normName', () => {
  it('folds Turkish case and diacritics', () => {
    expect(normName('İSKELE Kadıköy')).toBe('iskele kadikoy');
    expect(normName('Üsküdar')).toBe('uskudar');
  });
});

describe('matchPier', () => {
  it('prefers the Şehir Hatları ferry terminal', () => {
    const r = matchPier({ id: 'kadikoy', tr: 'Kadıköy', en: 'Kadıköy' }, els);
    expect(r.chosen?.el.id).toBe(1);
    expect(r.candidates.map((c) => c.el.id).sort()).toEqual([1, 2, 3]);
    expect(r.ambiguous).toBe(false);
  });

  it('honours alternative spellings and pins', () => {
    expect(matchPier({ id: 'rk', tr: 'Rumeli Kavağı', en: '', match: ['Rumeli Kavağı', 'Rumelikavağı'] }, els).chosen?.el.id).toBe(7);
    expect(matchPier({ id: 'k', tr: 'Kadıköy', en: '', osm: 'way/3' }, els).chosen?.point).toEqual([1.0003, 1]);
  });
});

describe('matchDistrict', () => {
  it('ranks suburb above town', () => {
    expect(matchDistrict({ id: 'kadikoy', tr: 'Kadıköy', en: 'Kadıköy' }, els).chosen?.el.id).toBe(5);
  });
});
