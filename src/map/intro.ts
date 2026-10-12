import type { Map as MlMap } from 'maplibre-gl';
import { CONFIG } from '../config';

export interface Camera {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

/**
 * Test switch `?view=lng,lat,zoom[,pitch[,bearing]]`: the initial camera (no fly, no jump — camera
 * jumps crash the headless browser used for screenshots). Null when absent or invalid.
 */
export function parseView(search: string): Camera | null {
  const v = new URLSearchParams(search).get('view');
  if (!v) return null;
  const n = v.split(',').map(Number);
  if (n.length < 3 || n.length > 5 || n.some((x) => !Number.isFinite(x))) return null;
  const c = CONFIG.camera;
  const [w, s, e, nn] = CONFIG.bounds;
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  return {
    center: [clamp(n[0], w, e), clamp(n[1], s, nn)],
    zoom: clamp(n[2], c.minZoom, c.maxZoom),
    pitch: clamp(n[3] ?? c.pitch, 0, c.maxPitch),
    bearing: n[4] ?? c.bearing,
  };
}

/** Camera to start from: `?view=`, else high above the Marmara for the intro, or the final view directly. */
export function initialCamera(withIntro: boolean, search = location.search): Camera {
  const c = CONFIG.camera;
  const view = parseView(search);
  if (view) return view;
  return withIntro ? { center: c.intro.center, zoom: c.intro.zoom, pitch: c.intro.pitch, bearing: c.intro.bearing } : { center: c.center, zoom: c.zoom, pitch: c.pitch, bearing: c.bearing };
}

/** Fly from the Marmara to the tilted view over the Bosphorus mouth (~3 s). Resolves when done. */
export function playIntro(map: MlMap): Promise<void> {
  const c = CONFIG.camera;
  return new Promise((resolve) => {
    map.once('moveend', () => resolve());
    map.flyTo({ center: c.center, zoom: c.zoom, pitch: c.pitch, bearing: c.bearing, duration: c.intro.durationMs, curve: 1.2, essential: false });
  });
}

/** Fade out and remove the HTML loading screen. */
export function hideLoader(): void {
  const el = document.getElementById('loader');
  if (!el) return;
  el.classList.add('loader--done');
  setTimeout(() => el.remove(), 700);
}
