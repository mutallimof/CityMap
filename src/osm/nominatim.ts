import { CONFIG } from '../config';

/**
 * Tiny Nominatim client for the browser, following the usage policy
 * (https://operations.osmfoundation.org/policies/nominatim/): at most one request per second
 * (queued, never parallel), results cached for the session, no autocomplete — searches run only
 * when the visitor submits. The browser sends the page as Referer, which identifies the app.
 */
const cache = new Map<string, unknown>();
let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function nominatim<T>(path: 'search' | 'lookup' | 'reverse', params: Record<string, string>): Promise<T | null> {
  const q = new URLSearchParams({ format: 'jsonv2', ...params });
  const url = `${CONFIG.osm.nominatim}/${path}?${q}`;
  if (cache.has(url)) return cache.get(url) as T;
  try {
    const ss = sessionStorage.getItem(url);
    if (ss) {
      const v = JSON.parse(ss) as T;
      cache.set(url, v);
      return v;
    }
  } catch {
    /* storage unavailable */
  }
  const run = async (): Promise<T | null> => {
    const wait = lastAt + CONFIG.osm.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    try {
      const res = await fetch(url, { headers: { 'Accept-Language': document.documentElement.lang === 'tr' ? 'tr,en' : 'en,tr' } });
      if (!res.ok) return null;
      const v = (await res.json()) as T;
      cache.set(url, v);
      try {
        sessionStorage.setItem(url, JSON.stringify(v));
      } catch {
        /* full / unavailable */
      }
      return v;
    } catch {
      return null;
    }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => null);
  return p;
}

/** "node/123" → "N123" (Nominatim lookup id). */
export function lookupId(osm: string): string | null {
  const m = /^(node|way|relation)\/(\d+)$/.exec(osm);
  return m ? `${m[1][0].toUpperCase()}${m[2]}` : null;
}

/** OpenMapTiles-from-Planetiler feature id (osm_id × 10 + 1/2/3) → "node/123". */
export function osmFromTileId(id: number): string | null {
  const type = ['', 'node', 'way', 'relation'][id % 10];
  return type ? `${type}/${Math.floor(id / 10)}` : null;
}
