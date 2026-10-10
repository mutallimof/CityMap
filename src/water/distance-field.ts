import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

/** 1-D squared distance transform (Felzenszwalb & Huttenlocher). */
function dt1(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  const INF = 1e20;
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) ** 2 + f[v[k]];
  }
}

/** Euclidean distance (in cells) from every cell to the nearest set cell of `mask`. */
export function distanceTransform(mask: Uint8Array, w: number, h: number): Float32Array {
  const m = Math.max(w, h);
  const f = new Float64Array(m);
  const d = new Float64Array(m);
  const v = new Int32Array(m);
  const z = new Float64Array(m + 1);
  const g = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = mask[i] ? 0 : 1e20;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x];
    dt1(f, h, d, v, z);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    dt1(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x]);
  }
  return out;
}

export interface CoastField {
  /** Row 0 = south edge (texture convention). 0 at the coast → 255 at ≥ maxM out to sea. */
  data: Uint8Array;
  width: number;
  height: number;
}

/**
 * Distance-to-coast field over `bounds` (lon/lat grid), rasterised with a 2D canvas.
 * Used by the water shader for the shallow → deep gradient and night shore glow.
 */
export function coastField(
  land: FeatureCollection<Polygon | MultiPolygon>,
  bounds: readonly [number, number, number, number],
  width: number,
  maxM: number,
): CoastField {
  const [w, s, e, n] = bounds;
  const kx = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const height = Math.round((width * (n - s)) / ((e - w) * kx));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (const f of land.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys)
      for (const ring of poly)
        ring.forEach(([lon, lat], i) => {
          const x = ((lon - w) / (e - w)) * width;
          const y = ((n - lat) / (n - s)) * height; // canvas row 0 = north
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
  }
  ctx.fill('evenodd');
  const px = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = px[i * 4] > 127 ? 1 : 0;
  const dist = distanceTransform(mask, width, height);
  const mPerCell = ((e - w) * 111_320 * kx) / width;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width; // flip so row 0 = south
    for (let x = 0; x < width; x++) data[y * width + x] = Math.min(255, Math.round(((dist[src + x] * mPerCell) / maxM) * 255));
  }
  return { data, width, height };
}
