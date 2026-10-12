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

describe('roof caps', () => {
  it('insets a square evenly, either winding; drops tiny buildings', async () => {
    const { insetRing } = await import('./split');
    const cw = [new Point(0, 0), new Point(100, 0), new Point(100, 100), new Point(0, 100), new Point(0, 0)];
    for (const ring of [cw, [...cw].reverse()]) {
      const r = insetRing(ring, 5)!;
      const xs = r.map((p) => p.x);
      const ys = r.map((p) => p.y);
      expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map((v) => Math.round(v))).toEqual([5, 95, 5, 95]);
    }
    expect(insetRing(sq(0, 0, 6), 5)).toBeNull();
  });

  it('a thin or L-shaped building still gets a cap inside it', async () => {
    const { insetRing } = await import('./split');
    const thin = [new Point(0, 0), new Point(200, 0), new Point(200, 8), new Point(0, 8), new Point(0, 0)];
    const r = insetRing(thin, 5)!;
    for (const p of r) expect(p.x >= 0 && p.x <= 200 && p.y >= 0 && p.y <= 8).toBe(true);
    const L = [new Point(0, 0), new Point(100, 0), new Point(100, 40), new Point(40, 40), new Point(40, 100), new Point(0, 100), new Point(0, 0)];
    const rl = insetRing(L, 4)!;
    expect(rl.length).toBe(L.length);
    expect(rl).toContainEqual({ x: 36, y: 36 }); // the reflex corner moves into the solid part
  });

  it('emits the roof layer only when asked, with the building attributes', () => {
    const merged = { type: 3 as const, id: 77, extent: 4096, properties: { render_height: 30, render_min_height: 0 }, loadGeometry: () => [sq(0, 0, 300)] };
    const input = fromVectorTileJs({ layers: { building: { version: 2, name: 'building', extent: 4096, length: 1, feature: () => merged } } });
    expect(new VectorTile(new PbfReader(splitBuildings(input, 3, 4, o))).layers.r).toBeUndefined();
    const out = new VectorTile(new PbfReader(splitBuildings(input, 9300, 6100, { ...o, roofInsetM: 1.4 })));
    const roof = out.layers.r.feature(0);
    expect(roof.properties.h).toBe(30);
    expect(roof.id).toBe(77);
    const ring = roof.loadGeometry()[0];
    expect(Math.min(...ring.map((p) => p.x))).toBeGreaterThan(0);
  });
});
