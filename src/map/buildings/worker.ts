/// <reference lib="webworker" />
import { splitBuildings, type SplitOptions } from './split';

/** Fetches an OpenFreeMap tile and re-packs its building layer (see split.ts), off the main thread. */
self.onmessage = async (e: MessageEvent<{ id: number; url: string; x: number; y: number; opts: SplitOptions }>) => {
  const { id, url, x, y, opts } = e.data;
  try {
    const res = await fetch(url);
    if (res.status === 204 || res.status === 404) return self.postMessage({ id, data: new ArrayBuffer(0) });
    if (!res.ok) throw new Error(`${res.status}`);
    const out = splitBuildings(await res.arrayBuffer(), x, y, opts);
    const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
    (self as unknown as Worker).postMessage({ id, data: buf }, [buf]);
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
