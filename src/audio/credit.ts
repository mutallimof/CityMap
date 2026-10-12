import type { Map as MlMap } from 'maplibre-gl';
import { setCredit } from '../map/credit';

/**
 * While sound is on, the map's attribution line credits the recordings (some are CC BY) and links the full
 * list (`audio/credits.html`, generated with the files).
 */
export function showSoundCredit(map: MlMap, on: boolean): void {
  const href = `${import.meta.env.BASE_URL}audio/credits.html`;
  setCredit(map, 'sound-credit', `<a href="${href}" target="_blank" rel="noopener">Sounds: Wikimedia Commons (CC0 / PD / CC BY)</a>`, on);
}
