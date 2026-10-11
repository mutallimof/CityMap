import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ferryLeg, resolveGuide, type GuideDeps, type GuideSpec } from './guides';

const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const places = json('data/places.geojson').features;
const piers = json('data/piers.geojson').features;
const landmarks = json('data/landmarks.geojson').features;
const routes = json('data/routes.geojson').features;
const lines = json('data/lines.json').lines;
const guides: GuideSpec[] = json('data/catalog/guides.json').guides;

const deps: GuideDeps = {
  place: (id) => {
    const f = places.find((x: { properties: { id: string } }) => x.properties.id === id);
    return f && { name: { tr: f.properties.name, en: f.properties.name }, lngLat: f.geometry.coordinates, icon: '' };
  },
  pier: (id) => {
    const f = piers.find((x: { properties: { id: string } }) => x.properties.id === id);
    return f && { name: { tr: f.properties.name, en: f.properties.nameEn }, lngLat: f.geometry.coordinates, icon: '' };
  },
  landmark: (id) => {
    const f = landmarks.find((x: { properties: { id: string }; geometry: { type: string } }) => x.properties.id === id && x.geometry.type === 'Point');
    return f && { name: { tr: f.properties.name, en: f.properties.nameEn }, lngLat: f.geometry.coordinates, icon: '' };
  },
  line: (id) => {
    const legs = routes
      .filter((x: { properties: { lineId: string } }) => x.properties.lineId === id)
      .map((x: { properties: { from: string; to: string }; geometry: { coordinates: [number, number][] } }) => ({ from: x.properties.from, to: x.properties.to, coords: x.geometry.coordinates }));
    const l = lines.find((x: { id: string }) => x.id === id);
    return l && legs.length ? { legs, color: l.color } : undefined;
  },
};

describe('guides', () => {
  it('every seed guide resolves against the real data', () => {
    expect(guides.length).toBeGreaterThanOrEqual(2);
    for (const g of guides) {
      const r = resolveGuide(g, deps);
      expect(r.stops).toHaveLength(g.stops.length);
      expect(r.legs).toHaveLength(g.stops.length - 1);
      for (const l of r.legs) expect(l.coords.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('ferry legs follow the route in travel direction', () => {
    const line = {
      legs: [
        { from: 'a', to: 'b', coords: [[0, 0], [1, 0], [2, 0]] as [number, number][] },
        { from: 'b', to: 'c', coords: [[2, 0], [3, 0]] as [number, number][] },
      ],
      color: '#000',
    };
    expect(ferryLeg(line, 'a', 'b')).toEqual([[0, 0], [1, 0], [2, 0]]);
    expect(ferryLeg(line, 'c', 'b')).toEqual([[3, 0], [2, 0]]);
    expect(ferryLeg(line, 'a', 'x')).toBeNull();
  });

  it('rejects dangling references', () => {
    expect(() => resolveGuide({ ...guides[0], stops: [{ ref: 'place:nope', note: { tr: '', en: '' } }] }, deps)).toThrow(/unknown stop/);
  });
});
