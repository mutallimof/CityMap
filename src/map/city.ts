import type { ExpressionSpecification, FilterSpecification, LayerSpecification, Map as MlMap } from 'maplibre-gl';
import { CONFIG } from '../config';
import type { CityPalette } from './city-look';

/**
 * The city from OpenStreetMap: OpenFreeMap vector tiles (OpenMapTiles schema, no key) drawn in our
 * own palette. Ground colours sit on top of our coastline's land fill (the sea stays our shader);
 * roads, bridges, 3D buildings and street names follow. Colours are re-applied by applyCityLook().
 */
export const CITY_SOURCE = 'city';
export const LANDMARK_SOURCE = 'landmarks';

export const CITY_LAYER = {
  landuse: 'city-landuse',
  landcover: 'city-landcover',
  blossom: 'city-blossom',
  tulips: 'city-tulips',
  roadCasing: 'city-road-casing',
  road: 'city-road',
  rail: 'city-rail',
  bridgeGlow: 'city-bridge-glow',
  bridgeLamps: 'city-bridge-lamps',
  buildings: 'city-buildings',
  buildingsLit: 'city-buildings-lit',
  landmarkGlow: 'city-landmark-glow',
  landmarkBuildings: 'city-landmark-buildings',
  streetLabels: 'city-street-labels',
} as const;

export const IMG = {
  blossom: 'city-blossom',
  tulips: 'city-tulips',
  windows: ['city-win-0', 'city-win-1', 'city-win-2'],
} as const;

const Z = (stops: [number, number][], base = 1.5): ExpressionSpecification => ['interpolate', ['exponential', base], ['zoom'], ...stops.flat()];

const MAJOR = ['motorway', 'trunk', 'primary'];
const MID = ['secondary', 'tertiary'];
const MINOR = ['minor', 'service', 'busway'];

/** Road widths (px) by class at these zooms; one top-level zoom interpolate with a class match per stop. */
const WIDTH_Z = [10, 12, 13, 14, 16, 18];
const WIDTHS = {
  major: [0.6, 1.3, 2, 3.2, 9, 24],
  mid: [0.2, 0.6, 1.1, 2, 6, 16],
  minor: [0, 0.15, 0.25, 0.7, 3.2, 10],
  path: [0, 0, 0, 0.2, 0.8, 1.6],
};
function widthExpr(extra: { major: number; mid: number; minor: number; path: number } = { major: 0, mid: 0, minor: 0, path: 0 }): ExpressionSpecification {
  const stops = WIDTH_Z.flatMap((z, i) => {
    const w = (k: keyof typeof WIDTHS) => (WIDTHS[k][i] > 0 ? WIDTHS[k][i] + extra[k] : 0);
    return [z, ['match', ['get', 'class'], MAJOR, w('major'), MID, w('mid'), 'path', w('path'), w('minor')]];
  });
  return ['interpolate', ['exponential', 1.5], ['zoom'], ...stops] as unknown as ExpressionSpecification;
}

const notTunnel: FilterSpecification = ['!=', ['get', 'brunnel'], 'tunnel'];
const classIn = (list: string[]): FilterSpecification => ['in', ['get', 'class'], ['literal', list]];

/** Feature id → stable small integer for pastel variety (ids are osm_id × 10 + type). */
const pick = (n: number): ExpressionSpecification => ['%', ['floor', ['/', ['to-number', ['id'], 0], 10]], n];

export interface CityIds {
  /** Building ids of highlighted landmarks (e.g. Galata Tower). */
  landmarkBuildings: number[];
  /** Landcover ids that bloom with tulips in spring (Emirgan). */
  tulipParks: number[];
}

export function cityLayers(p: CityPalette, ids: CityIds): LayerSpecification[] {
  const c = CONFIG.city;
  return [
    {
      id: CITY_LAYER.landuse,
      type: 'fill',
      source: CITY_SOURCE,
      'source-layer': 'landuse',
      minzoom: 10,
      paint: landusePaint(p),
    },
    {
      id: CITY_LAYER.landcover,
      type: 'fill',
      source: CITY_SOURCE,
      'source-layer': 'landcover',
      filter: classIn(['grass', 'wood', 'sand', 'farmland', 'wetland']),
      paint: landcoverPaint(p),
    },
    {
      // Seasonal accents over trees: purple Judas trees / pink blossom in spring, orange leaves in autumn.
      id: CITY_LAYER.blossom,
      type: 'fill',
      source: CITY_SOURCE,
      'source-layer': 'landcover',
      minzoom: 12,
      filter: ['any', ['==', ['get', 'class'], 'wood'], ['in', ['get', 'subclass'], ['literal', ['park', 'garden']]]],
      layout: { visibility: p.blossom.length ? 'visible' : 'none' },
      paint: { 'fill-pattern': IMG.blossom, 'fill-opacity': Z([[12, 0.35], [15, 0.9]]) },
    },
    {
      id: CITY_LAYER.tulips,
      type: 'fill',
      source: CITY_SOURCE,
      'source-layer': 'landcover',
      minzoom: 12,
      filter: ['in', ['to-number', ['id'], 0], ['literal', ids.tulipParks.length ? ids.tulipParks : [-1]]],
      layout: { visibility: 'none' },
      paint: { 'fill-pattern': IMG.tulips, 'fill-opacity': Z([[12, 0.6], [15, 1]]) },
    },
    {
      id: CITY_LAYER.rail,
      type: 'line',
      source: CITY_SOURCE,
      'source-layer': 'transportation',
      minzoom: 13,
      filter: ['all', classIn(['rail', 'transit']), notTunnel],
      paint: { 'line-color': p.rail, 'line-width': Z([[13, 0.6], [17, 2]]), 'line-dasharray': ['literal', [3, 2]] },
    },
    {
      id: CITY_LAYER.roadCasing,
      type: 'line',
      source: CITY_SOURCE,
      'source-layer': 'transportation',
      minzoom: 12,
      filter: ['all', classIn([...MAJOR, ...MID, ...MINOR]), notTunnel],
      layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': roadRank() },
      paint: roadCasingPaint(p),
    },
    {
      id: CITY_LAYER.road,
      type: 'line',
      source: CITY_SOURCE,
      'source-layer': 'transportation',
      minzoom: 10,
      filter: ['all', classIn([...MAJOR, ...MID, ...MINOR, 'path']), notTunnel],
      layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': roadRank() },
      paint: roadPaint(p),
    },
    {
      id: CITY_LAYER.bridgeGlow,
      type: 'line',
      source: LANDMARK_SOURCE,
      filter: ['==', ['get', 'kind'], 'bridge-line'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': p.bridge, 'line-width': Z([[10, 3], [13, 8], [16, 26]]), 'line-blur': Z([[10, 3], [13, 7], [16, 20]]), 'line-opacity': 0.35 },
    },
    {
      // String of lamps along the bridges, lit at night.
      id: CITY_LAYER.bridgeLamps,
      type: 'line',
      source: LANDMARK_SOURCE,
      filter: ['==', ['get', 'kind'], 'bridge-line'],
      layout: { 'line-cap': 'round', visibility: 'none' },
      paint: { 'line-color': '#FFE6B0', 'line-width': Z([[10, 1.2], [14, 2.6], [17, 5]]), 'line-dasharray': ['literal', [0.1, 3]], 'line-opacity': 0 },
    },
    {
      id: CITY_LAYER.buildings,
      type: 'fill-extrusion',
      source: CITY_SOURCE,
      'source-layer': 'building',
      minzoom: c.buildingsFrom[0],
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        ...buildingPaint(p, ids),
        'fill-extrusion-height': ['max', ['coalesce', ['get', 'render_height'], 0], c.buildingMinHeight],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-vertical-gradient': true,
        'fill-extrusion-opacity': buildingOpacity(1),
      },
    },
    {
      // Same buildings with lit-window patterns; cross-faded in at night.
      id: CITY_LAYER.buildingsLit,
      type: 'fill-extrusion',
      source: CITY_SOURCE,
      'source-layer': 'building',
      minzoom: c.buildingsFrom[0],
      filter: ['!=', ['get', 'hide_3d'], true],
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-pattern': ['match', pickBuilding(3), 0, IMG.windows[0], 1, IMG.windows[1], IMG.windows[2]],
        'fill-extrusion-height': ['max', ['coalesce', ['get', 'render_height'], 0], c.buildingMinHeight],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-vertical-gradient': true,
        'fill-extrusion-opacity': buildingOpacity(0),
      },
    },
    {
      // Landmark buildings (Galata Tower): warm gold by day, floodlit at night — above the window layer.
      id: CITY_LAYER.landmarkBuildings,
      type: 'fill-extrusion',
      source: CITY_SOURCE,
      'source-layer': 'building',
      minzoom: 13,
      filter: ['in', ['to-number', ['id'], 0], ['literal', ids.landmarkBuildings.length ? ids.landmarkBuildings : [-1]]],
      paint: {
        'fill-extrusion-color': p.landmark,
        'fill-extrusion-height': ['max', ['coalesce', ['get', 'render_height'], 0], c.buildingMinHeight],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-vertical-gradient': true,
        'fill-extrusion-opacity': 1,
      },
    },
    {
      id: CITY_LAYER.landmarkGlow,
      type: 'circle',
      source: LANDMARK_SOURCE,
      filter: ['==', ['get', 'kind'], 'tower'],
      paint: {
        'circle-color': p.landmark,
        'circle-radius': Z([[10, 6], [13, 16], [16, 60]]),
        'circle-blur': 1,
        'circle-opacity': 0.4,
        'circle-pitch-alignment': 'map',
      },
    },
    {
      id: CITY_LAYER.streetLabels,
      type: 'symbol',
      source: CITY_SOURCE,
      'source-layer': 'transportation_name',
      minzoom: c.streetLabelsFrom,
      filter: classIn([...MAJOR, ...MID, 'minor']),
      layout: {
        'symbol-placement': 'line',
        'text-field': ['coalesce', ['get', 'name'], ''],
        'text-font': [...c.font],
        'text-size': Z([[15, 10], [18, 13]]),
        'text-max-angle': 30,
        'symbol-spacing': 320,
      },
      paint: { 'text-color': p.streetLabel, 'text-halo-color': p.streetHalo, 'text-halo-width': 1.4, 'text-halo-blur': 0.5 },
    },
  ] as LayerSpecification[];
}

function roadRank(): ExpressionSpecification {
  return ['match', ['get', 'class'], 'motorway', 6, 'trunk', 5, 'primary', 4, 'secondary', 3, 'tertiary', 2, 'path', 0, 1];
}

function landusePaint(p: CityPalette) {
  const res = p.residential;
  return {
    'fill-color': [
      'match',
      ['get', 'class'],
      ['residential', 'suburb', 'quarter', 'neighbourhood'],
      ['match', pick(res.length), ...res.slice(0, -1).flatMap((col, i) => [i, col]), res[res.length - 1]],
      ['commercial', 'retail'],
      p.commercial,
      ['industrial', 'garages', 'railway', 'military', 'bus_station'],
      p.industrial,
      ['school', 'university', 'kindergarten', 'college', 'library'],
      p.institutional,
      'hospital',
      p.hospital,
      'cemetery',
      p.cemetery,
      ['pitch', 'stadium', 'playground', 'track', 'zoo', 'theme_park'],
      p.pitch,
      p.residential[0],
    ] as unknown as ExpressionSpecification,
    'fill-opacity': ['match', ['get', 'class'], ['residential', 'suburb', 'quarter', 'neighbourhood'], CONFIG.city.residentialOpacity, 0.9] as ExpressionSpecification,
  };
}

function landcoverPaint(p: CityPalette) {
  return {
    'fill-color': [
      'match',
      ['get', 'class'],
      'wood',
      p.wood,
      'sand',
      p.sand,
      'farmland',
      p.farmland,
      'wetland',
      p.wetland,
      ['match', ['get', 'subclass'], ['park', 'garden'], p.park, p.grass],
    ] as unknown as ExpressionSpecification,
    'fill-opacity': 0.95,
  };
}

function roadColor(p: CityPalette): ExpressionSpecification {
  return ['match', ['get', 'class'], MAJOR, p.roadMajor, 'path', p.path, p.road] as unknown as ExpressionSpecification;
}

function roadWidth(): ExpressionSpecification {
  return widthExpr();
}

function roadPaint(p: CityPalette) {
  return { 'line-color': roadColor(p), 'line-width': roadWidth(), 'line-opacity': ['match', ['get', 'class'], 'path', 0.7, 1] as ExpressionSpecification };
}

function roadCasingPaint(p: CityPalette) {
  return {
    'line-color': ['match', ['get', 'class'], MAJOR, p.roadMajorCasing, p.roadCasing] as unknown as ExpressionSpecification,
    'line-width': widthExpr({ major: 1.6, mid: 1.2, minor: 0.8, path: 0 }),
    'line-opacity': 0.8,
  };
}

/** Buildings merged into tiles often share ids, so mix the height in for pastel variety. */
const pickBuilding = (n: number): ExpressionSpecification => [
  '%',
  ['+', ['floor', ['/', ['to-number', ['id'], 0], 10]], ['round', ['*', ['coalesce', ['get', 'render_height'], 0], 3.7]]],
  n,
];

function buildingPaint(p: CityPalette, ids: CityIds) {
  const b = p.buildings;
  const pastel: ExpressionSpecification = ['match', pickBuilding(b.length), ...b.slice(0, -1).flatMap((col, i) => [i, col]), b[b.length - 1]] as unknown as ExpressionSpecification;
  return {
    'fill-extrusion-color': (ids.landmarkBuildings.length
      ? ['match', ['to-number', ['id'], 0], ids.landmarkBuildings, p.landmark, pastel]
      : pastel) as unknown as ExpressionSpecification,
  };
}

function buildingOpacity(k: number): ExpressionSpecification {
  const [a, b] = CONFIG.city.buildingsFrom;
  return ['interpolate', ['linear'], ['zoom'], a, 0, b, CONFIG.city.buildingOpacity * k];
}

/** Paint that depends on the palette, as [layer, property, value] triples (for setPaintProperty). */
export function cityPaint(p: CityPalette, ids: CityIds): [string, string, unknown][] {
  const out: [string, string, unknown][] = [];
  const add = (layer: string, paint: Record<string, unknown>) => Object.entries(paint).forEach(([k, v]) => out.push([layer, k, v]));
  add(CITY_LAYER.landuse, { 'fill-color': landusePaint(p)['fill-color'] });
  add(CITY_LAYER.landcover, { 'fill-color': landcoverPaint(p)['fill-color'] });
  add(CITY_LAYER.road, { 'line-color': roadColor(p) });
  add(CITY_LAYER.roadCasing, { 'line-color': roadCasingPaint(p)['line-color'] });
  add(CITY_LAYER.rail, { 'line-color': p.rail });
  add(CITY_LAYER.bridgeGlow, { 'line-color': p.bridge });
  add(CITY_LAYER.buildings, buildingPaint(p, ids));
  add(CITY_LAYER.landmarkGlow, { 'circle-color': p.landmark });
  add(CITY_LAYER.landmarkBuildings, { 'fill-extrusion-color': p.landmark });
  add(CITY_LAYER.streetLabels, { 'text-color': p.streetLabel, 'text-halo-color': p.streetHalo });
  return out;
}

/** Applies a palette + night level, skipping properties that didn't change. */
export class CityLook {
  private last = new Map<string, string>();
  private blossomKey = '';
  constructor(
    private map: MlMap,
    private ids: CityIds,
  ) {}

  apply(p: CityPalette, night: number, tulips: boolean): void {
    const map = this.map;
    for (const [layer, prop, value] of cityPaint(p, this.ids)) this.set(layer, prop, value);
    // Seasonal pattern images are regenerated only when their colours change.
    const key = p.blossom.join(',');
    if (key !== this.blossomKey) {
      this.blossomKey = key;
      if (p.blossom.length) putImage(map, IMG.blossom, dotPattern(p.blossom, 64, 26, 2.2, 7));
      this.visible(CITY_LAYER.blossom, p.blossom.length > 0);
    }
    this.visible(CITY_LAYER.tulips, tulips);
    // Night: lit-window buildings cross-fade over the pastel ones; bridges light up.
    const lit = Math.max(0, Math.min(1, (night - 0.25) / 0.6));
    this.visible(CITY_LAYER.buildingsLit, lit > 0.01);
    this.visible(CITY_LAYER.buildings, lit < 0.99);
    this.set(CITY_LAYER.buildingsLit, 'fill-extrusion-opacity', buildingOpacity(lit));
    this.set(CITY_LAYER.buildings, 'fill-extrusion-opacity', buildingOpacity(1 - lit * 0.999));
    this.visible(CITY_LAYER.bridgeLamps, night > 0.3);
    this.set(CITY_LAYER.bridgeLamps, 'line-opacity', Math.round(night * 20) / 20);
    this.set(CITY_LAYER.bridgeGlow, 'line-opacity', 0.3 + 0.4 * Math.round(night * 20) / 20);
    this.set(CITY_LAYER.landmarkGlow, 'circle-opacity', 0.35 + 0.4 * Math.round(night * 20) / 20);
  }

  private set(layer: string, prop: string, value: unknown): void {
    const k = `${layer}|${prop}`;
    const v = JSON.stringify(value);
    if (this.last.get(k) === v) return;
    this.last.set(k, v);
    (this.map.setPaintProperty as (l: string, p: string, v: unknown) => void).call(this.map, layer, prop, value);
  }

  private visible(layer: string, on: boolean): void {
    const k = `${layer}|visibility`;
    const v = on ? 'visible' : 'none';
    if (this.last.get(k) === v) return;
    this.last.set(k, v);
    this.map.setLayoutProperty(layer, 'visibility', v);
  }
}

/* ---------- generated pattern images ---------- */

function putImage(map: MlMap, id: string, img: ImageData): void {
  const old = map.hasImage(id) ? map.getImage(id) : null;
  if (old && old.data.width === img.width && old.data.height === img.height) {
    map.updateImage(id, img);
    return;
  }
  if (old) map.removeImage(id);
  map.addImage(id, img, { pixelRatio: 2 });
}

/** Seeded PRNG so patterns are identical on every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function canvas(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext('2d')!] as const;
}

/** Transparent tile scattered with soft coloured dots (blossom, leaves, tulips). Wraps seamlessly. */
export function dotPattern(colors: readonly string[], size: number, count: number, r: number, seed: number): ImageData {
  const [, g] = canvas(size, size);
  const rand = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rr = r * (0.7 + rand() * 0.6);
    g.fillStyle = colors[i % colors.length];
    for (const dx of [-size, 0, size])
      for (const dy of [-size, 0, size]) {
        g.beginPath();
        g.arc(x + dx, y + dy, rr, 0, Math.PI * 2);
        g.fill();
      }
  }
  return g.getImageData(0, 0, size, size);
}

/** Facade tile with a grid of windows, a share of them lit warm. */
export function windowPattern(seed: number): ImageData {
  const c = CONFIG.city;
  const size = 32;
  const [, g] = canvas(size, size);
  g.fillStyle = c.windowFacade;
  g.fillRect(0, 0, size, size);
  const rand = rng(seed);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const lit = rand() < c.windowLitShare;
      g.fillStyle = lit ? c.windowLit[Math.floor(rand() * c.windowLit.length)] : c.windowDark;
      g.fillRect(x * 8 + 2, y * 8 + 2, 4, 5);
    }
  return g.getImageData(0, 0, size, size);
}

export function addCityImages(map: MlMap): void {
  IMG.windows.forEach((id, i) => putImage(map, id, windowPattern(11 + i * 7)));
  putImage(map, IMG.tulips, dotPattern([...CONFIG.city.tulips], 48, 60, 2, 3));
  putImage(map, IMG.blossom, dotPattern(['#00000000'], 8, 1, 1, 1));
}
