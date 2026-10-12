import { look } from '../../themes';
import { addProtocol } from 'maplibre-gl';
import { CONFIG } from '../../config';
import BuildingsWorker from './worker?worker';
import heroData from '../../../data/hero-landmarks.json';

/**
 * `buildings://z/x/y` → OpenFreeMap tile with the building layer split into single buildings
 * (layer "b"). Work happens in a small pool of Web Workers; the HTTP cache shares the tile
 * download with the main city source.
 */
const BUILDINGS_PROTOCOL = 'buildings';

/** Tile URL template for the active look: `r=<inset m>` asks the worker for roof caps, `x=1` drops the OSM
 *  buildings under hero landmark models (themes with style.landmarks3d draw their own). */
export function buildingTilesUrl(): string {
  const q = [look().style.buildings.cap ? `r=${CONFIG.city.roofInsetM}` : '', look().style.landmarks3d ? 'x=1' : ''].filter(Boolean).join('&');
  return `${BUILDINGS_PROTOCOL}://{z}/{x}/{y}${q ? `?${q}` : ''}`;
}

/** Hero footprints (lng/lat corners of the oriented box, a little enlarged) — buildings inside are dropped. */
const EXCLUDE: [number, number][][] = heroData.landmarks.map((h) => {
  const kx = 111_320 * Math.cos((h.lngLat[1] * Math.PI) / 180);
  const r = (h.bearing * Math.PI) / 180;
  const [ux, uy] = [Math.sin(r), Math.cos(r)];
  const [vx, vy] = [uy, -ux];
  const L = (h.lengthM / 2) * 1.15 + 4;
  const W = (h.widthM / 2) * 1.15 + 4;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => [h.lngLat[0] + (a * L * ux + b * W * vx) / kx, h.lngLat[1] + (a * L * uy + b * W * vy) / 110_574] as [number, number]);
});

export async function registerBuildingsProtocol(): Promise<void> {
  const tj = (await (await fetch(CONFIG.city.tiles)).json()) as { tiles: string[] };
  const template = tj.tiles[0];
  const pool = Array.from({ length: Math.min(2, navigator.hardwareConcurrency || 2) }, () => new BuildingsWorker());
  const pending = new Map<number, { resolve: (b: ArrayBuffer) => void; reject: (e: Error) => void }>();
  for (const w of pool)
    w.onmessage = (e: MessageEvent<{ id: number; data?: ArrayBuffer; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error !== undefined) p.reject(new Error(e.data.error));
      else p.resolve(e.data.data!);
    };
  let next = 0;
  const b = look().city.buildings;
  addProtocol(BUILDINGS_PROTOCOL, (params) => {
    const m = /^buildings:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    const roof = /[?&]r=([\d.]+)/.exec(params.url);
    const exclude = /[?&]x=1/.test(params.url) ? EXCLUDE : undefined;
    if (!m) return Promise.reject(new Error(`bad url ${params.url}`));
    const [z, x, y] = m.slice(1).map(Number);
    const url = template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
    const id = ++next;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve: (data) => resolve({ data }), reject });
      pool[id % pool.length].postMessage({ id, url, x, y, opts: { floorM: b.floorM, minFloors: b.minFloors, maxFloors: b.maxFloors, roofInsetM: roof ? Number(roof[1]) : 0, exclude } });
    });
  });
}
