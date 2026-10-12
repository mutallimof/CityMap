import type { Map as MlMap } from 'maplibre-gl';
import { look } from '../themes';

/**
 * Pattern images the city layers draw with, generated on a canvas (seeded, identical on every load):
 * tree crowns / blossom, tulip beds and night facades with lit windows. Re-put when the look changes.
 */
export const IMG = {
  blossom: 'city-blossom',
  tulips: 'city-tulips',
  /** Night facades: dark, sparse, medium, livelier — chosen per building. */
  windows: ['city-win-0', 'city-win-1', 'city-win-2', 'city-win-3'],
} as const;

export function putImage(map: MlMap, id: string, img: ImageData): void {
  const old = map.hasImage(id) ? map.getImage(id) : null;
  if (old && old.data.width === img.width && old.data.height === img.height) {
    map.updateImage(id, img);
    return;
  }
  if (old) map.removeImage(id);
  map.addImage(id, img, { pixelRatio: 2 });
}

/** Seeded PRNG so patterns are identical on every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** A CPU-backed canvas: every pattern is read back with getImageData (a GPU canvas stalls on read-back). */
function canvas(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext('2d', { willReadFrequently: true })!] as const;
}

/** Transparent tile scattered with soft coloured dots (blossom, leaves, tulips). Wraps seamlessly. */
function dotPattern(colors: readonly string[], size: number, count: number, r: number, seed: number): ImageData {
  const [, g] = canvas(size, size);
  const rand = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rr = r * (0.7 + rand() * 0.6);
    g.fillStyle = colors[i % colors.length];
    for (const dx of [-size, 0, size])
      for (const dy of [-size, 0, size]) {
        g.beginPath();
        g.arc(x + dx, y + dy, rr, 0, Math.PI * 2);
        g.fill();
      }
  }
  return g.getImageData(0, 0, size, size);
}

/** Transparent tile with clumps of coloured dots — tree crowns (autumn leaves, blossom, snow). Wraps. */
export function crownPattern(colors: readonly string[], seed: number): ImageData {
  const c = look().city.crowns;
  const size = c.tile;
  const [, g] = canvas(size, size);
  const rand = rng(seed);
  for (let k = 0; k < c.clumps; k++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const dots = 4 + Math.floor(rand() * 5);
    for (let i = 0; i < dots; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * 6.5;
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      const r = c.dotR[0] + rand() * (c.dotR[1] - c.dotR[0]);
      g.globalAlpha = 0.7 + rand() * 0.3;
      g.fillStyle = colors[Math.floor(rand() * colors.length)];
      for (const dx of [-size, 0, size])
        for (const dy of [-size, 0, size]) {
          g.beginPath();
          g.arc(x + dx, y + dy, r, 0, Math.PI * 2);
          g.fill();
        }
    }
  }
  g.globalAlpha = 1;
  return g.getImageData(0, 0, size, size);
}

/**
 * Night facade tile: rows of floors with mostly dark windows; a share are lit in runs (a lit flat
 * spans 1–3 windows), warm tones of varying strength. `share` 0 = a dark building. Tiles are large
 * (64 px) and irregular so no grid reads at a glance.
 */
function windowPattern(seed: number, share: number): ImageData {
  const n = look().city.lights;
  const size = 64;
  const [, g] = canvas(size, size);
  g.fillStyle = n.facade;
  g.fillRect(0, 0, size, size);
  if (share <= 0) return g.getImageData(0, 0, size, size);
  const rand = rng(seed);
  const rows = 8; // floors per tile
  const cols = 10;
  for (let r = 0; r < rows; r++) {
    let run = 0;
    for (let k = 0; k < cols; k++) {
      // Lit flats come in short runs; whole floors are sometimes dark.
      const floorDark = rand() < 0.35;
      const lit = !floorDark && (run > 0 ? rand() < 0.55 : rand() < share);
      run = lit ? run + 1 : 0;
      if (!lit) continue;
      const col = n.windows[Math.floor(rand() * n.windows.length)];
      g.globalAlpha = 0.55 + rand() * 0.45;
      g.fillStyle = col;
      g.fillRect(k * 6.4 + 1.6, r * 8 + 2, 2.6, 3.6);
    }
  }
  g.globalAlpha = 1;
  return g.getImageData(0, 0, size, size);
}

export function addCityImages(map: MlMap): void {
  const shares = [0, ...look().city.lights.litShares];
  IMG.windows.forEach((id, i) => putImage(map, id, windowPattern(11 + i * 7, shares[i])));
  putImage(map, IMG.tulips, dotPattern([...look().city.tulips], 48, 60, 2, 3));
  putImage(map, IMG.blossom, dotPattern(['#00000000'], 8, 1, 1, 1));
}
