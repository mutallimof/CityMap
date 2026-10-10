import { addProtocol } from 'maplibre-gl';
import { CONFIG } from '../../config';
import BuildingsWorker from './worker?worker';

/**
 * `buildings://z/x/y` → OpenFreeMap tile with the building layer split into single buildings
 * (layer "b"). Work happens in a small pool of Web Workers; the HTTP cache shares the tile
 * download with the main city source.
 */
export const BUILDINGS_PROTOCOL = 'buildings';

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
  const b = CONFIG.city.buildings;
  addProtocol(BUILDINGS_PROTOCOL, (params) => {
    const m = /^buildings:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) return Promise.reject(new Error(`bad url ${params.url}`));
    const [z, x, y] = m.slice(1).map(Number);
    const url = template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
    const id = ++next;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve: (data) => resolve({ data }), reject });
      pool[id % pool.length].postMessage({ id, url, x, y, opts: { floorM: b.floorM, minFloors: b.minFloors, maxFloors: b.maxFloors } });
    });
  });
}
