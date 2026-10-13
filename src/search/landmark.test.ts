import { describe, expect, it } from 'vitest';
import { landmarkPlace } from './landmark';

const ll: [number, number] = [29, 41];
const tower = { id: 'maidens-tower', name: 'Kız Kulesi', nameEn: "Maiden's Tower", kind: 'tower' as const, osm: 'relation/4429796' };

describe('landmark picked in search', () => {
  it('opens the featured place of the same OSM element', () => {
    expect(landmarkPlace(tower, ll, [{ id: 'other', osm: 'node/1', source: 'featured' }, { id: 'kiz-kulesi', osm: 'relation/4429796', source: 'featured' }])).toEqual({ existing: 'kiz-kulesi' });
  });

  it('else builds an OSM place from the landmark (same shape as a map tap)', () => {
    const r = landmarkPlace(tower, ll, []);
    expect(r).toEqual({ add: { id: 'osm:relation/4429796', name: 'Kız Kulesi', nameEn: "Maiden's Tower", category: 'culture', kind: 'attraction', osm: 'relation/4429796', district: null, hours: null, cuisine: null, lngLat: ll, source: 'osm' } });
  });

  it('reuses the OSM place when it was added before', () => {
    expect(landmarkPlace(tower, ll, [{ id: 'osm:relation/4429796', osm: 'relation/4429796', source: 'osm' }])).toEqual({ existing: 'osm:relation/4429796' });
  });

  it('a landmark without an OSM element has no sheet (camera only)', () => {
    expect(landmarkPlace({ id: 'x', name: 'Bridge', kind: 'bridge' }, ll, [])).toBeNull();
  });
});
