import type { Map as MlMap } from 'maplibre-gl';
import { CONFIG } from '../config';

/** Camera to start from: high above the Marmara for the intro, or the final view directly. */
export function initialCamera(withIntro: boolean) {
  const c = CONFIG.camera;
  return withIntro ? c.intro : { center: c.center, zoom: c.zoom, pitch: c.pitch, bearing: c.bearing };
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
