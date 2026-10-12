import { look } from '../themes';
import { MAP_FONT_FACES } from '../themes/fonts';
import type { StyleSpecification, ExpressionSpecification } from 'maplibre-gl';
import { CONFIG, type Palette } from '../config';

export const SOURCE = {
  land: 'land',
  shore: 'shore',
  piers: 'piers',
  routes: 'routes',
} as const;

export const LAYER = {
  land: 'land',
  innerShadow: 'land-inner-shadow',
  shoreHighlight: 'shore-highlight',
  piers: 'piers',
  routes: 'routes',
} as const;

const EMPTY = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] });

/** Linear zoom interpolation between z10 and z16. */
function byZoom([a, b]: readonly [number, number]): ExpressionSpecification {
  return ['interpolate', ['exponential', 1.6], ['zoom'], 10, a, 16, b];
}

/**
 * Hand-built style: no tiles, no glyphs, no API keys. Water is the background;
 * land and shoreline come from our clipped OSM coastline.
 */
export function buildStyle(p: Palette = look().colors.day): StyleSpecification {
  const s = look().shore;
  return {
    version: 8,
    glyphs: CONFIG.city.glyphs,
    // Theme label fonts (self-hosted OFL files, downloaded only when a label uses them).
    'font-faces': MAP_FONT_FACES,
    sources: {
      [SOURCE.land]: { type: 'geojson', data: EMPTY(), attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>' },
      [SOURCE.shore]: { type: 'geojson', data: EMPTY() },
      [SOURCE.piers]: { type: 'geojson', data: EMPTY() },
      [SOURCE.routes]: { type: 'geojson', data: EMPTY() },
    },
    sky: {
      'sky-color': p.sky,
      'horizon-color': p.horizon,
      'fog-color': p.fog,
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.7,
      'fog-ground-blend': 0.85,
      'atmosphere-blend': 0,
    },
    layers: [
      { id: 'water', type: 'background', paint: { 'background-color': p.land } },
      {
        id: LAYER.land,
        type: 'fill',
        source: SOURCE.land,
        // 0.999: keeps land in MapLibre's ordered (translucent) pass so it draws *after* the custom
        // water layer; fully opaque fills are drawn early with depth and the water would cover them.
        paint: { 'fill-color': p.land, 'fill-antialias': true, 'fill-opacity': 0.999 },
      },
      {
        // Rings are RFC 7946-wound (land on the left), so a negative offset pushes inland.
        id: LAYER.innerShadow,
        type: 'line',
        source: SOURCE.shore,
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': p.landInnerShadow,
          'line-width': byZoom(s.innerShadowWidth),
          'line-blur': byZoom(s.innerShadowBlur),
          'line-offset': byZoom([-s.innerShadowWidth[0] / 2, -s.innerShadowWidth[1] / 2]),
          'line-opacity': s.innerShadowOpacity,
        },
      },
      {
        id: LAYER.shoreHighlight,
        type: 'line',
        source: SOURCE.shore,
        layout: { 'line-join': 'round' },
        paint: { 'line-color': p.shoreHighlight, 'line-width': byZoom(s.highlightWidth) },
      },
      {
        id: LAYER.routes,
        type: 'line',
        source: SOURCE.routes,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': byZoom(look().routes.width),
          'line-opacity': look().routes.opacity,
          'line-dasharray': ['literal', look().routes.dash],
        },
      },
      {
        id: LAYER.piers,
        type: 'circle',
        source: SOURCE.piers,
        paint: {
          'circle-color': look().colors.pier,
          'circle-radius': byZoom(look().piers.radius),
          'circle-stroke-color': look().colors.pierStroke,
          'circle-stroke-width': byZoom(look().piers.strokeWidth),
          'circle-pitch-alignment': 'map',
        },
      },
    ],
  };
}

/** Theme-dependent paint of the base layers, as [layer, property, value] (re-applied on a theme switch). */
export function basePaint(): [string, string, unknown][] {
  const t = look();
  const s = t.shore;
  return [
    [LAYER.innerShadow, 'line-width', byZoom(s.innerShadowWidth)],
    [LAYER.innerShadow, 'line-blur', byZoom(s.innerShadowBlur)],
    [LAYER.innerShadow, 'line-offset', byZoom([-s.innerShadowWidth[0] / 2, -s.innerShadowWidth[1] / 2])],
    [LAYER.innerShadow, 'line-opacity', s.innerShadowOpacity],
    [LAYER.shoreHighlight, 'line-width', byZoom(s.highlightWidth)],
    [LAYER.routes, 'line-width', byZoom(t.routes.width)],
    [LAYER.routes, 'line-opacity', t.routes.opacity],
    [LAYER.routes, 'line-dasharray', ['literal', t.routes.dash]],
    [LAYER.piers, 'circle-color', t.colors.pier],
    [LAYER.piers, 'circle-radius', byZoom(t.piers.radius)],
    [LAYER.piers, 'circle-stroke-color', t.colors.pierStroke],
    [LAYER.piers, 'circle-stroke-width', byZoom(t.piers.strokeWidth)],
  ];
}

/** Sets [layer, property, value] triples; "layout:" before the property name means a layout property. */
export function setStyleProps(map: import('maplibre-gl').Map, props: [string, string, unknown][]): void {
  for (const [layer, prop, value] of props) {
    if (!map.getLayer(layer)) continue;
    if (prop.startsWith('layout:')) (map.setLayoutProperty as (l: string, p: string, v: unknown) => void).call(map, layer, prop.slice(7), value);
    else (map.setPaintProperty as (l: string, p: string, v: unknown) => void).call(map, layer, prop, value);
  }
}
