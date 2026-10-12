import { look } from '../themes';
import type { ExpressionSpecification, Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import { CONFIG } from '../config';

/**
 * District and pier names as MapLibre symbol layers (OpenFreeMap glyphs), so they share one
 * collision space with place icons, landmarks and streets — labels never overlap.
 */
export const LABEL_LAYERS = { district: 'label-district', pier: 'label-pier' } as const;

interface Named {
  name: string;
  nameEn?: string;
}

const field = (lang: 'tr' | 'en'): ExpressionSpecification => (lang === 'en' ? ['coalesce', ['get', 'nameEn'], ['get', 'name']] : ['get', 'name']);

export function addMapLabels(map: MlMap, districts: FeatureCollection<Point, Named>, piers: FeatureCollection<Point, Named>): void {
  const l = CONFIG.labels;
  map.addSource('labels-district', { type: 'geojson', data: districts });
  map.addSource('labels-pier', { type: 'geojson', data: piers });
  map.addLayer({
    id: LABEL_LAYERS.district,
    type: 'symbol',
    source: 'labels-district',
    minzoom: l.districtMinZoom,
    maxzoom: l.districtMaxZoom,
    layout: {
      'text-field': ['upcase', field('tr')],
      'text-font': [...look().city.fontBold],
      'text-size': ['interpolate', ['linear'], ['zoom'], 11, 11, 14, 13.5],
      'text-letter-spacing': 0.14,
      'text-max-width': 12,
      'symbol-sort-key': 0,
    },
    paint: { 'text-color': look().colors.labelText, 'text-halo-color': look().colors.labelHaloHex, 'text-halo-width': 1.6, 'text-opacity': 0.85 },
  });
  map.addLayer({
    id: LABEL_LAYERS.pier,
    type: 'symbol',
    source: 'labels-pier',
    minzoom: look().piers.labelMinZoom,
    layout: {
      'text-field': field('tr'),
      'text-font': [...look().city.font],
      'text-size': 11.5,
      'text-anchor': 'top',
      'text-offset': [0, 0.8],
      'text-optional': true,
    },
    paint: { 'text-color': look().labels.pier, 'text-halo-color': look().colors.labelHaloHex, 'text-halo-width': 1.5 },
  });
}

export function setLabelLang(map: MlMap, lang: 'tr' | 'en'): void {
  map.setLayoutProperty(LABEL_LAYERS.district, 'text-field', ['upcase', field(lang)]);
  map.setLayoutProperty(LABEL_LAYERS.pier, 'text-field', field(lang));
}

export function setLabelNight(map: MlMap, night: boolean): void {
  const t = look();
  map.setPaintProperty(LABEL_LAYERS.district, 'text-color', night ? t.colors.labelTextNight : t.colors.labelText);
  map.setPaintProperty(LABEL_LAYERS.district, 'text-halo-color', night ? t.colors.labelHaloNight : t.colors.labelHaloHex);
  map.setPaintProperty(LABEL_LAYERS.pier, 'text-color', night ? t.labels.pierNight : t.labels.pier);
  map.setPaintProperty(LABEL_LAYERS.pier, 'text-halo-color', night ? t.colors.labelHaloNight : t.colors.labelHaloHex);
}

/** Theme switch: fonts and halo widths (colours follow with setLabelNight). */
export function setLabelFonts(map: MlMap): void {
  const t = look();
  map.setLayoutProperty(LABEL_LAYERS.district, 'text-font', [...t.city.fontBold]);
  map.setLayoutProperty(LABEL_LAYERS.pier, 'text-font', [...t.city.font]);
  map.setPaintProperty(LABEL_LAYERS.district, 'text-halo-width', t.style.labelHalo);
  map.setPaintProperty(LABEL_LAYERS.pier, 'text-halo-width', t.style.labelHalo - 0.1);
  for (const l of [LABEL_LAYERS.district, LABEL_LAYERS.pier]) map.setPaintProperty(l, 'text-halo-blur', t.style.labelBlur);
}
