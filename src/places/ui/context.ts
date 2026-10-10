import { CONFIG } from '../../config';
import { services } from '../../ui/services';
import { ui } from '../../ui/store';
import type { PlacesStore } from '../store';
import { distanceM } from '../store';

let store: PlacesStore | null = null;
let reduced = false;

export function setPlaces(s: PlacesStore, reduceMotion: boolean): void {
  store = s;
  reduced = reduceMotion;
}

export function places(): PlacesStore {
  if (!store) throw new Error('places not initialised');
  return store;
}

/** Fly so the target sits in the visible part of the map above the sheet. */
export function flyTo(lngLat: [number, number], zoom: number = CONFIG.places.flyZoom): void {
  const { map } = services();
  map.flyTo({
    center: lngLat,
    zoom: Math.max(map.getZoom(), zoom),
    pitch: Math.max(map.getPitch(), 45),
    offset: [0, -Math.round(window.innerHeight * 0.2)],
    duration: reduced ? 0 : 1500,
    essential: false,
  });
}

export function openPlace(id: string, fly = true): void {
  const p = places().byId.get(id);
  if (!p) return;
  ui.set({ selection: { kind: 'place', id }, follow: false, hint: false, sheetSnap: 'half' });
  if (fly) flyTo(p.lngLat);
}

export function openPier(id: string, fly = true): void {
  const p = services().pierById.get(id);
  if (!p) return;
  ui.set({ selection: { kind: 'pier', id }, follow: false, hint: false, sheetSnap: 'half' });
  if (fly) flyTo(p.lngLat, 14.6);
}

/** Served pier (some line stops there) closest to a point, by straight-line distance. */
export function nearestPier(lngLat: [number, number]): { id: string; distance: number } {
  let best = { id: '', distance: Infinity };
  const served = new Set(services().lines.flatMap((l) => l.stops));
  for (const [id, p] of services().pierById) {
    if (!served.has(id)) continue;
    const d = distanceM(lngLat, p.lngLat);
    if (d < best.distance) best = { id, distance: d };
  }
  return best;
}

/** Share link that opens the app flown to a place (#place=id). */
export function placeLink(id: string): string {
  return `${location.origin}${location.pathname}#place=${encodeURIComponent(id)}`;
}

export async function share(title: string, url: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return 'shared';
    }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
