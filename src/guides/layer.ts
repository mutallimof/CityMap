import { look } from '../themes';
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import { guideGeoJSON, type ResolvedGuide } from './guides';

const SRC = 'guide';
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** The open guide drawn on the map: dotted walks, ferry legs in the line colour, numbered stops. */
export function addGuideLayers(map: MlMap): void {
  map.addSource(SRC, { type: 'geojson', data: EMPTY });
  const before = map.getLayer('weather') ? 'weather' : undefined;
  map.addLayer(
    {
      id: 'guide-ferry',
      type: 'line',
      source: SRC,
      filter: ['==', ['get', 'mode'], 'ferry'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 7], 'line-opacity': 0.95 },
    },
    before,
  );
  map.addLayer(
    {
      id: 'guide-walk',
      type: 'line',
      source: SRC,
      filter: ['==', ['get', 'mode'], 'walk'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': look().guides.walkColor, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 16, 5], 'line-dasharray': ['literal', [0.2, 1.8]] },
    },
    before,
  );
  map.addLayer(
    {
      id: 'guide-stops',
      type: 'circle',
      source: SRC,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 11, 'circle-color': look().guides.stopColor, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2.5 },
    },
    before,
  );
  map.addLayer(
    {
      id: 'guide-num',
      type: 'symbol',
      source: SRC,
      filter: ['==', ['geometry-type'], 'Point'],
      layout: { 'text-field': ['get', 'n'], 'text-font': [...look().city.fontBold], 'text-size': 12, 'text-allow-overlap': true, 'text-ignore-placement': true },
      paint: { 'text-color': '#FFFFFF' },
    },
    before,
  );
}

export function showGuide(map: MlMap, g: ResolvedGuide | null): void {
  (map.getSource(SRC) as GeoJSONSource | undefined)?.setData(g ? guideGeoJSON(g) : EMPTY);
}

/** Theme-dependent paint of the guide layers (re-applied on a theme switch). */
export function guidePaint(): [string, string, unknown][] {
  const t = look();
  return [
    ['guide-walk', 'line-color', t.guides.walkColor],
    ['guide-stops', 'circle-color', t.guides.stopColor],
    ['guide-num', 'layout:text-font', [...t.city.fontBold]],
  ];
}
