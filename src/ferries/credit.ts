import type { Map as MlMap } from 'maplibre-gl';
import { setCredit } from '../map/credit';

/** The ferry timetables' sources, credited in the attribution bar (one row; the page lists each with its link). */
export const FERRY_CREDIT_TEXT = 'Ferry times: Şehir Hatları · Turyol · Dentur Avrasya';

export function showFerryCredit(map: MlMap): void {
  setCredit(map, 'ferry-credit', `<a href="${import.meta.env.BASE_URL}ferry-credits.html" target="_blank" rel="noopener">${FERRY_CREDIT_TEXT}</a>`, true);
}
