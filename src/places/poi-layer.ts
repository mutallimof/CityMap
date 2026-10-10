import type { ExpressionSpecification, FilterSpecification, Map as MlMap, MapGeoJSONFeature, PointLike } from 'maplibre-gl';
import { CONFIG } from '../config';
import { CITY_SOURCE } from '../map/city';
import { osmFromTileId } from '../osm/nominatim';
import type { Category } from '../ui/store';
import type { Place, PlaceCategory } from './types';

/**
 * Every named café, restaurant, museum, shop and park from the OpenStreetMap tiles, as a symbol
 * layer under the featured pins. They fade in by zoom and importance (OpenMapTiles `rank`), and
 * MapLibre's collision keeps them from piling up. Featured places are skipped (they have pins).
 */
export const POI_LAYER = 'poi';

export const POI_CLASSES: Record<Exclude<PlaceCategory, 'view'>, string[]> = {
  food: ['cafe', 'restaurant', 'fast_food', 'bar', 'beer', 'ice_cream', 'bakery'],
  culture: ['museum', 'art_gallery', 'theatre', 'cinema', 'attraction', 'castle', 'monument', 'library', 'music'],
  shopping: ['shop', 'clothing_store', 'grocery', 'books', 'gift', 'jewelry', 'mall', 'department_store', 'florist', 'marketplace'],
  park: ['park', 'garden'],
};

export const POI_ICON: Record<string, string> = {
  cafe: '☕', restaurant: '🍽', fast_food: '🥙', bar: '🍸', beer: '🍺', ice_cream: '🍦', bakery: '🥐',
  museum: '🏛', art_gallery: '🖼', theatre: '🎭', cinema: '🎬', attraction: '⭐', castle: '🏰', monument: '🗿', library: '📚', music: '🎵',
  shop: '🛍', clothing_store: '👗', grocery: '🧺', books: '📚', gift: '🎁', jewelry: '💍', mall: '🛍', department_store: '🛍', florist: '💐', marketplace: '🧺',
  park: '🌳', garden: '🌷',
};

export const CATEGORY_COLOR: Record<PlaceCategory, string> = { food: '#F08A5D', culture: '#9B6AD6', shopping: '#2E9FB0', park: '#4CAF6A', view: '#F2B33D' };

const ALL = Object.values(POI_CLASSES).flat();

export function categoryOfClass(cls: string): Exclude<PlaceCategory, 'view'> | null {
  for (const [cat, list] of Object.entries(POI_CLASSES)) if (list.includes(cls)) return cat as Exclude<PlaceCategory, 'view'>;
  return null;
}

/** OSM "node/123" → tile feature id (osm_id × 10 + 1/2/3). */
export function tileIdFromOsm(osm: string): number | null {
  const m = /^(node|way|relation)\/(\d+)$/.exec(osm);
  return m ? Number(m[2]) * 10 + ['node', 'way', 'relation'].indexOf(m[1]) + 1 : null;
}

export class PoiLayer {
  private skip: number[];
  constructor(
    private map: MlMap,
    featuredOsm: string[],
  ) {
    this.skip = featuredOsm.map(tileIdFromOsm).filter((x): x is number => x !== null);
    const p = CONFIG.places;
    for (const cls of ALL) if (!map.hasImage(`poi-${cls}`)) map.addImage(`poi-${cls}`, poiIcon(cls), { pixelRatio: 2 });
    map.addLayer(
      {
        id: POI_LAYER,
        type: 'symbol',
        source: CITY_SOURCE,
        'source-layer': 'poi',
        minzoom: p.poiFrom,
        filter: this.filter([]),
        layout: {
          'icon-image': ['concat', 'poi-', ['get', 'class']],
          'icon-size': ['interpolate', ['linear'], ['zoom'], p.poiFrom, 0.62, 17, 1],
          'icon-padding': 3,
          'text-field': ['step', ['zoom'], '', p.poiNamesFrom, ['coalesce', ['get', 'name'], '']],
          'text-font': [...CONFIG.city.fontBold],
          'text-size': 11,
          'text-offset': [0, 1.15],
          'text-anchor': 'top',
          'text-max-width': 9,
          'text-optional': true,
          'symbol-sort-key': ['get', 'rank'],
        },
        paint: {
          'icon-opacity': ['interpolate', ['linear'], ['zoom'], p.poiFrom, 0, p.poiFrom + 0.6, 1],
          'text-color': '#5A4B3A',
          'text-halo-color': '#FFF8EC',
          'text-halo-width': 1.4,
        },
      },
      'weather',
    );
  }

  /** Zoom reveals more: at z15 only the best-ranked, all of them by z17. */
  private filter(categories: Category[]): FilterSpecification {
    const classes = categories.length ? categories.flatMap((c) => POI_CLASSES[c]) : ALL;
    return [
      'all',
      ['in', ['get', 'class'], ['literal', classes]],
      ['has', 'name'],
      ['!', ['in', ['to-number', ['id'], 0], ['literal', this.skip.length ? this.skip : [-1]]]],
      ['<=', ['coalesce', ['get', 'rank'], 99], ['step', ['zoom'], 3, 16, 12, 17, 999] as ExpressionSpecification],
    ] as FilterSpecification;
  }

  setFilters(f: { categories: Category[]; openNow: boolean; visible: boolean }): void {
    this.map.setFilter(POI_LAYER, this.filter(f.categories));
    // Map POIs carry no opening hours, so "open now" shows only places whose hours we know.
    this.map.setLayoutProperty(POI_LAYER, 'visibility', f.openNow || !f.visible ? 'none' : 'visible');
  }

  setNight(night: number): void {
    this.map.setPaintProperty(POI_LAYER, 'text-color', night > 0.5 ? '#E9E1D2' : '#5A4B3A');
    this.map.setPaintProperty(POI_LAYER, 'text-halo-color', night > 0.5 ? '#141A24' : '#FFF8EC');
  }

  /** The POI under a tap (generous hit box), as a Place. */
  at(point: { x: number; y: number }): Place | null {
    const r = 16;
    const box: [PointLike, PointLike] = [
      [point.x - r, point.y - r],
      [point.x + r, point.y + r],
    ];
    if (!this.map.getLayer(POI_LAYER)) return null;
    const hits = this.map.queryRenderedFeatures(box, { layers: [POI_LAYER] });
    if (!hits.length) return null;
    const pick = hits.sort((a, b) => dist(a, point, this.map) - dist(b, point, this.map))[0];
    return placeFromFeature(pick);
  }
}

function dist(f: MapGeoJSONFeature, p: { x: number; y: number }, map: MlMap): number {
  const c = (f.geometry as GeoJSON.Point).coordinates as [number, number];
  const q = map.project(c);
  return Math.hypot(q.x - p.x, q.y - p.y);
}

export function placeFromFeature(f: Pick<MapGeoJSONFeature, 'id' | 'properties' | 'geometry'>): Place | null {
  const props = f.properties as Record<string, string | number | undefined>;
  const osm = typeof f.id === 'number' ? osmFromTileId(f.id) : null;
  const cls = String(props.class ?? '');
  const category = categoryOfClass(cls);
  if (!osm || !category || !props.name) return null;
  return {
    id: `osm:${osm}`,
    name: String(props.name),
    nameEn: props['name:en'] ? String(props['name:en']) : null,
    category,
    kind: String(props.subclass ?? cls),
    osm,
    district: null,
    hours: null,
    cuisine: null,
    lngLat: (f.geometry as GeoJSON.Point).coordinates as [number, number],
    source: 'osm',
  };
}

/** Small round icon: white disc, category-coloured ring, emoji. */
function poiIcon(cls: string): ImageData {
  const size = 44;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const cat = categoryOfClass(cls) ?? 'culture';
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  g.fillStyle = '#FFFAF2';
  g.shadowColor = 'rgba(20,30,40,0.3)';
  g.shadowBlur = 3;
  g.shadowOffsetY = 1;
  g.fill();
  g.shadowColor = 'transparent';
  g.lineWidth = 3;
  g.strokeStyle = CATEGORY_COLOR[cat];
  g.stroke();
  g.font = '21px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(POI_ICON[cls] ?? '•', size / 2, size / 2 + 1);
  return g.getImageData(0, 0, size, size);
}
