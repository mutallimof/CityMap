import { classifyRings, VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { fromVectorTileJs, type VectorTileFeatureLike, type VectorTileLayerLike } from '@maplibre/vt-pbf';
import type Point from '@mapbox/point-geometry';

/**
 * OpenFreeMap's z14 building layer groups every building of the same height in a tile into one
 * multipolygon (shared id + attributes), so a style can't vary colour or height per building.
 * This re-packs the layer: one feature per building polygon, each with
 *   v   0–99 stable variation (hash of its first vertex + tile), for colour / lit windows
 *   h   height: OSM's real height when present, else a modest 2–5 floors chosen by v
 *   b   base height (building:min_height)
 * The original tile id is kept as the feature id (landmark matching). Pure.
 */
export const LAYER = 'b';

export interface SplitOptions {
  floorM: number;
  minFloors: number;
  maxFloors: number;
}

/** Height for a building: real OSM height if known (> 0), else floors from the variation value. */
export function buildingHeight(renderHeight: number | undefined, v: number, o: SplitOptions): number {
  if (renderHeight && renderHeight > 0) return renderHeight;
  const floors = o.minFloors + (v % (o.maxFloors - o.minFloors + 1));
  return floors * o.floorM;
}

/** Small integer hash → 0–99. */
export function variation(x: number, y: number, tx: number, ty: number): number {
  let h = Math.imul(x * 73856093 ^ y * 19349663 ^ tx * 83492791 ^ ty * 2654435761, 1597334677) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h % 100;
}

class Feature implements VectorTileFeatureLike {
  type = 3 as const;
  constructor(
    public id: number | undefined,
    public properties: Record<string, number>,
    public extent: number,
    private rings: Point[][],
  ) {}
  loadGeometry(): Point[][] {
    return this.rings;
  }
}

class Layer implements VectorTileLayerLike {
  version = 2;
  name = LAYER;
  constructor(
    public extent: number,
    private features: Feature[],
  ) {}
  get length() {
    return this.features.length;
  }
  feature(i: number) {
    return this.features[i];
  }
}

export function splitBuildings(data: ArrayBuffer | Uint8Array, tx: number, ty: number, o: SplitOptions): Uint8Array {
  const tile = new VectorTile(new PbfReader(data instanceof Uint8Array ? data : new Uint8Array(data)));
  const src = tile.layers.building;
  const out: Feature[] = [];
  const extent = src?.extent ?? 4096;
  if (src) {
    for (let i = 0; i < src.length; i++) {
      const f = src.feature(i);
      if (f.type !== 3 || f.properties.hide_3d === true) continue;
      const rh = Number(f.properties.render_height ?? 0);
      const base = Number(f.properties.render_min_height ?? 0);
      for (const poly of classifyRings(f.loadGeometry())) {
        const p0 = poly[0]?.[0];
        if (!p0) continue;
        const v = variation(p0.x, p0.y, tx, ty);
        out.push(new Feature(typeof f.id === 'number' ? f.id : undefined, { v, h: Math.round(buildingHeight(rh, v, o) * 10) / 10, b: base }, extent, poly));
      }
    }
  }
  return fromVectorTileJs({ layers: { [LAYER]: new Layer(extent, out) } });
}
