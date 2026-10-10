import { describe, expect, it } from 'vitest';
import * as turf from '@turf/turf';
import { assembleCoastline, mergeWays, perimeterT, type BBox } from './assemble-coastline';

const BOX: BBox = [0, 0, 10, 10];
const area = (ring: number[][]) => turf.area(turf.polygon([ring]));

describe('perimeterT', () => {
  it('increases counter-clockwise from the SW corner', () => {
    expect(perimeterT([5, 0], BOX)).toBeCloseTo(0.5);
    expect(perimeterT([10, 5], BOX)).toBeCloseTo(1.5);
    expect(perimeterT([5, 10], BOX)).toBeCloseTo(2.5);
    expect(perimeterT([0, 5], BOX)).toBeCloseTo(3.5);
    expect(perimeterT([5, 5], BOX)).toBeNaN();
  });
});

describe('mergeWays', () => {
  it('joins ways sharing endpoints regardless of input order', () => {
    const chains = mergeWays([
      [[5, 5], [5, 11]],
      [[5, -1], [5, 5]],
    ]);
    expect(chains).toEqual([[[5, -1], [5, 5], [5, 11]]]);
  });
});

describe('assembleCoastline', () => {
  it('closes a coast crossing the box with land on the left (west)', () => {
    const { polygons, warnings } = assembleCoastline([[[5, -1], [5, 11]]], BOX);
    expect(warnings).toEqual([]);
    expect(polygons).toHaveLength(1);
    expect(polygons[0][0]).toEqual([[5, 0], [5, 10], [0, 10], [0, 0], [5, 0]]);
  });

  it('builds both shores of a strait as separate land polygons', () => {
    const west = [[3, -1], [3, 11]]; // walking north, land west
    const east = [[7, 11], [7, -1]]; // walking south, land east
    const { polygons } = assembleCoastline([west, east], BOX);
    expect(polygons).toHaveLength(2);
    const areas = polygons.map((p) => area(p[0])).sort((a, b) => a - b);
    const total = area([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
    // West strip is 3/10 of the box, east strip 3/10 (the strait is the middle 4/10).
    expect(areas[0] / total).toBeCloseTo(0.3, 1);
    expect(areas[1] / total).toBeCloseTo(0.3, 1);
  });

  it('wraps through corners when a coast cuts one corner', () => {
    // Coast entering on the east edge and leaving on the south edge.
    const { polygons } = assembleCoastline([[[11, 4], [6, -1]]], BOX); // walking SW, land on the left = SE
    expect(polygons).toHaveLength(1);
    expect(polygons[0][0]).toContainEqual([10, 0]);
    expect(polygons[0][0]).not.toContainEqual([0, 0]);
  });

  it('keeps counter-clockwise closed rings as islands', () => {
    const island = [[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]];
    const { polygons } = assembleCoastline([island], BOX);
    expect(polygons).toEqual([[island]]);
  });

  it('warns about chains that end inside the box', () => {
    const { warnings } = assembleCoastline([[[5, -1], [5, 5]]], BOX);
    expect(warnings.length).toBe(1);
  });
});
