import { describe, expect, it } from 'vitest';
import type { FeatureCollection, Polygon } from 'geojson';
import { shorelineFromLand } from './shoreline';

const BBOX = [0, 0, 10, 10] as const;

function fc(rings: number[][][]): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: rings } }],
  };
}

describe('shorelineFromLand', () => {
  it('keeps a whole island ring', () => {
    const ring = [[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]];
    const out = shorelineFromLand(fc([ring]), BBOX);
    expect(out.coordinates).toEqual([ring]);
  });

  it('drops segments running along the clip box', () => {
    // Land occupying the west half; coast is the jagged line at x≈5.
    const ring = [[0, 0], [5, 0], [6, 5], [5, 10], [0, 10], [0, 0]];
    const out = shorelineFromLand(fc([ring]), BBOX);
    expect(out.coordinates).toEqual([[[5, 0], [6, 5], [5, 10]]]);
  });
});
