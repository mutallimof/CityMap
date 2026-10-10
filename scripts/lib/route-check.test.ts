import { describe, expect, it } from 'vitest';
import type { FeatureCollection, Polygon } from 'geojson';
import { shorelineFromLand } from '../../src/map/shoreline';
import { localProj } from './local-proj';
import { CoastIndex } from './route-check';

// A small island ~0.01° (≈ 840 m × 1.1 km) in the middle of a 0.1° box.
const BOX = [29, 41, 29.1, 41.1] as const;
const island: FeatureCollection<Polygon> = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[29.045, 41.045], [29.055, 41.045], [29.055, 41.055], [29.045, 41.055], [29.045, 41.045]]] } }],
};
const coast = new CoastIndex(shorelineFromLand(island, BOX), island, localProj(29, 41, 41.05));

describe('route check', () => {
  it('passes open water', () => {
    expect(coast.checkLeg([[29.01, 41.01], [29.03, 41.02]], 30, 100).violations).toEqual([]);
  });

  it('catches a leg crossing land', () => {
    const r = coast.checkLeg([[29.03, 41.05], [29.07, 41.05]], 30, 100);
    expect(r.violations.some((v) => v.kind === 'land')).toBe(true);
  });

  it('catches a leg skimming the coast closer than 30 m', () => {
    // Runs 0.0002° (~17 m) north of the island's north edge.
    const r = coast.checkLeg([[29.03, 41.0552], [29.07, 41.0552]], 30, 100);
    expect(r.violations.some((v) => v.kind === 'coast')).toBe(true);
    expect(r.violations.some((v) => v.kind === 'land')).toBe(false);
  });

  it('exempts the last 100 m into a pier', () => {
    // Ends 15 m off the coast, approaching perpendicular.
    const r = coast.checkLeg([[29.05, 41.07], [29.05, 41.05515]], 30, 100);
    expect(r.violations).toEqual([]);
  });
});
