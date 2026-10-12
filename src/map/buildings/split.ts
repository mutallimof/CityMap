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
const LAYER = 'b';
/** Roof caps: each building's outer ring inset by `roofInsetM` (same v / h / b), for themes with capped roofs. */
const ROOF_LAYER = 'r';

export interface SplitOptions {
  floorM: number;
  minFloors: number;
  maxFloors: number;
  /** Roof inset (m); 0 / absent = no roof layer. */
  roofInsetM?: number;
  /** Lng/lat polygons: buildings whose centre falls inside are dropped (hero landmark models stand there). */
  exclude?: [number, number][][];
}

const ringArea = (r: { x: number; y: number }[]) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j].x * r[i].y - r[i].x * r[j].y;
  return a / 2;
};

/**
 * Outer ring moved inwards by `d` (tile units): mitred offset of every edge, miters clamped to 2.5·d.
 * Falls back to shrinking towards the centroid when the offset folds over (small or thin buildings).
 * Returns null when the building is too small for a cap. Pure.
 */
export function insetRing(ring: { x: number; y: number }[], d: number): { x: number; y: number }[] | null {
  const pts = ring.length > 1 && ring[0].x === ring[ring.length - 1].x && ring[0].y === ring[ring.length - 1].y ? ring.slice(0, -1) : ring.slice();
  const n = pts.length;
  if (n < 3) return null;
  const a0 = ringArea(pts);
  if (Math.abs(a0) < d * d * 6) return null;
  const sign = a0 > 0 ? 1 : -1;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n];
    const c = pts[i];
    const q = pts[(i + 1) % n];
    const l1 = Math.hypot(c.x - p.x, c.y - p.y) || 1;
    const l2 = Math.hypot(q.x - c.x, q.y - c.y) || 1;
    // Inward normals (left of travel for a positive-area ring in these coordinates).
    const n1x = (-(c.y - p.y) / l1) * sign;
    const n1y = ((c.x - p.x) / l1) * sign;
    const n2x = (-(q.y - c.y) / l2) * sign;
    const n2y = ((q.x - c.x) / l2) * sign;
    let mx = n1x + n2x;
    let my = n1y + n2y;
    const ml = Math.hypot(mx, my);
    if (ml < 1e-6) {
      mx = n1x;
      my = n1y;
    } else {
      mx /= ml;
      my /= ml;
    }
    const k = Math.min(2.5 * d, d / Math.max(0.2, mx * n1x + my * n1y));
    out.push({ x: c.x + mx * k, y: c.y + my * k });
  }
  const a1 = ringArea(out);
  if (Math.sign(a1) === Math.sign(a0) && Math.abs(a1) > Math.abs(a0) * 0.3 && Math.abs(a1) < Math.abs(a0)) return [...out, out[0]];
  // Fallback: shrink towards the centroid so the smaller side loses ~2·d.
  const cx = pts.reduce((s, p) => s + p.x, 0) / n;
  const cy = pts.reduce((s, p) => s + p.y, 0) / n;
  const w = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
  const h = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
  const f = Math.max(0.45, 1 - (2 * d) / Math.max(1e-6, Math.min(w, h)));
  const s = pts.map((p) => ({ x: cx + (p.x - cx) * f, y: cy + (p.y - cy) * f }));
  return [...s, s[0]];
}

/** Tile units per metre at the centre of tile row `ty` (z14, extent). */
function unitsPerMetre(ty: number, extent: number, z = 14): number {
  const n = 2 ** z;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + 0.5)) / n)));
  return extent / ((40_075_016.7 * Math.cos(lat)) / n);
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
  name: string = LAYER;
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

class RoofLayer extends Layer {
  name = ROOF_LAYER;
}

export function splitBuildings(data: ArrayBuffer | Uint8Array, tx: number, ty: number, o: SplitOptions): Uint8Array {
  const tile = new VectorTile(new PbfReader(data instanceof Uint8Array ? data : new Uint8Array(data)));
  const src = tile.layers.building;
  const out: Feature[] = [];
  const roofs: Feature[] = [];
  const extent = src?.extent ?? 4096;
  const inset = o.roofInsetM ? o.roofInsetM * unitsPerMetre(ty, extent) : 0;
  // Exclusion polygons in this tile's coordinates (z14).
  const n14 = 2 ** 14;
  const toTile = ([lng, lat]: [number, number]) => ({
    x: (((lng + 180) / 360) * n14 - tx) * extent,
    y: (((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n14 - ty) * extent,
  });
  const excl = (o.exclude ?? []).map((poly) => poly.map(toTile));
  const excluded = (ring: { x: number; y: number }[]) => {
    if (!excl.length) return false;
    const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p.y, 0) / ring.length;
    return excl.some((poly) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        if (poly[i].y > cy !== poly[j].y > cy && cx < ((poly[j].x - poly[i].x) * (cy - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) inside = !inside;
      }
      return inside;
    });
  };
  if (src) {
    for (let i = 0; i < src.length; i++) {
      const f = src.feature(i);
      if (f.type !== 3 || f.properties.hide_3d === true) continue;
      const rh = Number(f.properties.render_height ?? 0);
      const base = Number(f.properties.render_min_height ?? 0);
      for (const poly of classifyRings(f.loadGeometry())) {
        const p0 = poly[0]?.[0];
        if (!p0 || excluded(poly[0])) continue;
        const v = variation(p0.x, p0.y, tx, ty);
        const props = { v, h: Math.round(buildingHeight(rh, v, o) * 10) / 10, b: base };
        const fid = typeof f.id === 'number' ? f.id : undefined;
        out.push(new Feature(fid, props, extent, poly));
        if (inset > 0) {
          const r = insetRing(poly[0], inset);
          // a = footprint side (m, √area): very large roofs (stadiums, halls) get a calm colour in the style.
          const a = Math.round(Math.sqrt(Math.abs(ringArea(poly[0]))) / unitsPerMetre(ty, extent));
          if (r) roofs.push(new Feature(fid, { ...props, a }, extent, [r.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }) as Point)]));
        }
      }
    }
  }
  const layers: Record<string, VectorTileLayerLike> = { [LAYER]: new Layer(extent, out) };
  if (inset > 0) layers[ROOF_LAYER] = new RoofLayer(extent, roofs);
  return fromVectorTileJs({ layers });
}
