import type { Map as MlMap } from 'maplibre-gl';
import { CONFIG } from '../config';
import { look } from '../themes';

const SRC = 'hero-labels';
export const HERO_LABELS = 'hero-labels';

/**
 * Names under the hero landmark models (themes with style.landmarks3d), in the same collision space as
 * the other labels. The models replace their pins; this keeps the names.
 */
export function syncHeroLabels(map: MlMap, heroes: { id: string; name: string; nameEn: string; lngLat: number[] }[], lang: 'tr' | 'en', night: boolean): void {
  const t = look();
  const on = t.style.landmarks3d;
  if (!map.getSource(SRC)) {
    if (!on) return;
    map.addSource(SRC, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: heroes.map((h) => ({ type: 'Feature', properties: { name: h.name, nameEn: h.nameEn }, geometry: { type: 'Point', coordinates: h.lngLat } })) },
    });
    map.addLayer(
      {
        id: HERO_LABELS,
        type: 'symbol',
        source: SRC,
        minzoom: CONFIG.scenery.heroesFrom + 0.8,
        layout: { 'text-field': ['get', 'name'], 'text-font': [...t.labels.placeFont], 'text-size': 13, 'text-anchor': 'top', 'text-offset': [0, 0.9], 'text-max-width': 9, 'symbol-sort-key': -3 },
        paint: { 'text-color': t.labels.landmark, 'text-halo-color': t.labels.poiHalo, 'text-halo-width': 1.8 },
      },
      map.getLayer('featured') ? 'featured' : undefined,
    );
  }
  map.setLayoutProperty(HERO_LABELS, 'visibility', on ? 'visible' : 'none');
  map.setLayoutProperty(HERO_LABELS, 'text-field', lang === 'en' ? ['get', 'nameEn'] : ['get', 'name']);
  map.setLayoutProperty(HERO_LABELS, 'text-font', [...t.labels.placeFont]);
  map.setPaintProperty(HERO_LABELS, 'text-color', night ? t.labels.landmarkNight : t.labels.landmark);
  map.setPaintProperty(HERO_LABELS, 'text-halo-color', night ? t.labels.poiHaloNight : t.labels.poiHalo);
}
