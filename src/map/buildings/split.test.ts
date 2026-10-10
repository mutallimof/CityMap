import { describe, expect, it } from 'vitest';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { fromVectorTileJs } from '@maplibre/vt-pbf';
import Point from '@mapbox/point-geometry';
import { buildingHeight, splitBuildings, variation } from './split';

const o = { floorM: 3.2, minFloors: 2, maxFloors: 5 };
const sq = (x: number, y: number, s: number) => [new Point(x, y), new Point(x + s, y), new Point(x + s, y + s), new Point(x, y + s), new Point(x, y)];

describe('building split', () => {
  it('keeps real heights, gives 2–5 floors otherwise', () => {
    expect(buildingHeight(63, 7, o)).toBe(63);
    for (let v = 0; v < 100; v++) {
      const h = buildingHeight(0, v, o);
      expect(h).toBeGreaterThanOrEqual(6.4 - 1e-9);
      expect(h).toBeLessThanOrEqual(16 + 1e-9);
    }
  });

  it('variation is stable and spread', () => {
    expect(variation(10, 20, 1, 2)).toBe(variation(10, 20, 1, 2));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => variation(i * 37, i * 11, 5, 9)));
    expect([...seen].every((v) => v >= 0 && v < 100)).toBe(true);
    expect(seen.size).toBeGreaterThan(50);
  });

  it('splits a merged multipolygon into one feature per building', () => {
    const merged = {
      type: 3 as const,
      id: 1231,
      extent: 4096,
      properties: { render_height: 0, render_min_height: 0 },
      loadGeometry: () => [sq(0, 0, 100), sq(200, 0, 100), sq(400, 0, 50)],
    };
    const input = fromVectorTileJs({ layers: { building: { version: 2, name: 'building', extent: 4096, length: 1, feature: () => merged } } });
    const out = new VectorTile(new PbfReader(splitBuildings(input, 3, 4, o)));
    const l = out.layers.b;
    expect(l.length).toBe(3);
    const f = l.feature(1);
    expect(f.id).toBe(1231);
    expect(Number(f.properties.h)).toBeGreaterThan(6);
    expect(Number(f.properties.v)).toBeGreaterThanOrEqual(0);
    expect(f.properties.v).toBeTypeOf('number');
  });
});
