import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, Map as MlMap, MapGeoJSONFeature, PointLike } from 'maplibre-gl';
import type { FeatureCollection, MultiLineString, Point } from 'geojson';
import { CONFIG } from '../config';
import { CITY_SOURCE, LANDMARK_SOURCE } from '../map/city';
import type { LandmarkProps } from '../data/load';
import { osmFromTileId } from '../osm/nominatim';
import type { Category } from '../ui/store';
import { ICON_KINDS, iconImage, kindOfPlace, POI_KINDS, type IconKind } from './icons';
import type { PlacesStore } from './store';
import type { Place, PlaceCategory } from './types';

/**
 * All place icons and their names are MapLibre symbols in one collision space, so nothing ever
 * overlaps: featured places (big glowing pins) > landmarks > map POIs. Only visitor-relevant OSM
 * POIs are shown (cafés, restaurants, bars, bakeries, museums, galleries, theatres, cinemas,
 * malls / bazaars, parks, viewpoints, landmarks); they appear by zoom and OpenMapTiles rank, with
 * names only for the most important.
 */
export const LAYERS = { poi: 'poi', landmarks: 'landmark-icons', featured: 'featured' } as const;
const FEATURED_SOURCE = 'featured';

export const CATEGORY_OF: Record<IconKind, PlaceCategory> = {
  cafe: 'food',
  restaurant: 'food',
  bar: 'food',
  bakery: 'food',
  museum: 'culture',
  gallery: 'culture',
  theatre: 'culture',
  cinema: 'culture',
  landmark: 'culture',
  shop: 'shopping',
  park: 'park',
  viewpoint: 'view',
};

/** Chip → icon kinds it shows. */
const CHIP_KINDS: Record<Category, IconKind[]> = {
  food: ['cafe', 'restaurant', 'bar', 'bakery'],
  culture: ['museum', 'gallery', 'theatre', 'cinema', 'landmark'],
  shopping: ['shop'],
  park: ['park', 'viewpoint'],
};

// Subclasses in our allow-list are unique, so match on subclass and guard with the class list.
const SUB_KIND = Object.fromEntries(Object.entries(POI_KINDS).map(([k, v]) => [k.split('/')[1], v]));
const ALLOWED_CLASSES = [...new Set(Object.keys(POI_KINDS).map((k) => k.split('/')[0]))];
const poiKindExpr = (): ExpressionSpecification =>
  ['match', ['get', 'subclass'], ...Object.entries(SUB_KIND).flatMap(([k, v]) => [k, v]), ''] as unknown as ExpressionSpecification;

export function iconKindOfPoi(cls: string, subclass: string): IconKind | null {
  return POI_KINDS[`${cls}/${subclass}`] ?? null;
}

/** Back-compat for search / shared links: OSM class (+ subclass) → place category. */
export function categoryOfClass(cls: string, subclass = cls): PlaceCategory | null {
  const k = iconKindOfPoi(cls, subclass) ?? iconKindOfPoi(cls, cls) ?? ((ICON_KINDS as string[]).includes(cls) ? (cls as IconKind) : null);
  if (k) return CATEGORY_OF[k];
  return ['mall', 'marketplace', 'department_store'].includes(cls) ? 'shopping' : ['garden', 'park'].includes(cls) ? 'park' : null;
}

/** OSM "node/123" → tile feature id (osm_id × 10 + 1/2/3). */
export function tileIdFromOsm(osm: string): number | null {
  const m = /^(node|way|relation)\/(\d+)$/.exec(osm);
  return m ? Number(m[2]) * 10 + ['node', 'way', 'relation'].indexOf(m[1]) + 1 : null;
}

type Feat = Pick<MapGeoJSONFeature, 'id' | 'properties' | 'geometry'>;

export function placeFromFeature(f: Feat): Place | null {
  const props = f.properties as Record<string, string | number | undefined>;
  const osm = typeof f.id === 'number' ? osmFromTileId(f.id) : null;
  const k = iconKindOfPoi(String(props.class ?? ''), String(props.subclass ?? ''));
  if (!osm || !k || !props.name) return null;
  return {
    id: `osm:${osm}`,
    name: String(props.name),
    nameEn: props['name:en'] ? String(props['name:en']) : null,
    category: CATEGORY_OF[k],
    kind: String(props.subclass ?? props.class),
    osm,
    district: null,
    hours: null,
    cuisine: null,
    lngLat: (f.geometry as GeoJSON.Point).coordinates as [number, number],
    source: 'osm',
  };
}

const textColor = (night: boolean) => (night ? '#ECE4D6' : '#4A3D30');
const haloColor = (night: boolean) => (night ? 'rgba(18,22,30,0.92)' : 'rgba(255,250,242,0.95)');

export class PlaceLayers {
  private skip: number[];
  private state = { night: false, golden: false, lang: 'tr' as 'tr' | 'en', key: '' };

  constructor(
    private map: MlMap,
    private store: PlacesStore,
    landmarks: FeatureCollection<Point | MultiLineString, LandmarkProps>,
  ) {
    const featuredOsm = new Set(store.places.map((p) => p.osm));
    // Tile POIs that are featured places or our landmarks are drawn by those layers instead.
    this.skip = [...featuredOsm, ...landmarks.features.map((f) => f.properties.osm ?? '')].map(tileIdFromOsm).filter((x): x is number => x !== null);
    this.addImages();
    const ic = CONFIG.icons;
    const p = CONFIG.places;
    const before = map.getLayer('weather') ? 'weather' : undefined;

    map.addLayer(
      {
        id: LAYERS.poi,
        type: 'symbol',
        source: CITY_SOURCE,
        'source-layer': 'poi',
        minzoom: p.poiFrom,
        filter: this.poiFilter([]),
        layout: {
          'icon-image': ['concat', 'poi-', poiKindExpr()],
          'icon-size': ['interpolate', ['linear'], ['zoom'], p.poiFrom, 0.72, 17, 1],
          'icon-padding': ic.poiPadding,
          // Names only for the important ones until you're close in.
          'text-field': ['step', ['zoom'], '', p.poiNamesFrom, ['case', ['<=', ['coalesce', ['get', 'rank'], 999], CONFIG.places.poiNameRank], ['coalesce', ['get', 'name'], ''], ''], 17.4, ['coalesce', ['get', 'name'], '']],
          'text-font': [...CONFIG.city.fontBold],
          'text-size': 11,
          'text-offset': [0, 1.05],
          'text-anchor': 'top',
          'text-max-width': 8,
          'text-optional': true,
          'text-padding': 4,
          'symbol-sort-key': ['+', ['*', ['match', poiKindExpr(), ['landmark', 'museum'], 0, ['restaurant', 'cafe', 'bar'], 1, 2], 100], ['coalesce', ['get', 'rank'], 99]],
        },
        paint: {
          'icon-opacity': ['interpolate', ['linear'], ['zoom'], p.poiFrom, 0, p.poiFrom + 0.5, 1],
          'text-color': textColor(false),
          'text-halo-color': haloColor(false),
          'text-halo-width': 1.4,
        },
      },
      before,
    );

    map.addLayer(
      {
        id: LAYERS.landmarks,
        type: 'symbol',
        source: LANDMARK_SOURCE,
        minzoom: CONFIG.city.landmarkLabelsFrom - 1,
        filter: ['all', ['==', ['geometry-type'], 'Point'], ['!=', ['get', 'kind'], 'tulips']],
        layout: {
          'icon-image': 'landmark-big',
          'icon-padding': 2,
          'text-field': this.nameField(),
          'text-font': [...CONFIG.city.fontBold],
          'text-size': 12.5,
          'text-offset': [0, 1.3],
          'text-anchor': 'top',
          'text-max-width': 9,
          'text-optional': true,
          'symbol-sort-key': 0,
        },
        paint: { 'text-color': '#8A6410', 'text-halo-color': haloColor(false), 'text-halo-width': 1.6 },
      },
      before,
    );

    map.addSource(FEATURED_SOURCE, { type: 'geojson', data: this.featuredData([], false, Date.now()) });
    map.addLayer(
      {
        id: LAYERS.featured,
        type: 'symbol',
        source: FEATURED_SOURCE,
        // Zoomed out only the well-known places.
        filter: ['step', ['zoom'], ['all', ['get', 'vis'], ['get', 'major']], p.allPinsZoom, ['get', 'vis']] as unknown as FilterSpecification,
        layout: {
          'icon-image': ['concat', 'feat-', ['get', 'icon'], ['case', ['get', 'open'], '-o', '']],
          'icon-anchor': 'bottom',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.72, 14, 0.9, 16, 1],
          'icon-padding': 2,
          'text-field': ['step', ['zoom'], '', p.featuredNamesFrom, this.nameField()],
          'text-font': [...CONFIG.city.fontBold],
          'text-size': 12.5,
          'text-anchor': 'top',
          'text-offset': [0, 0.3],
          'text-max-width': 9,
          'text-optional': true,
          'symbol-sort-key': ['case', ['get', 'fav'], 0, ['get', 'major'], 1, 2],
        },
        paint: { 'text-color': textColor(false), 'text-halo-color': haloColor(false), 'text-halo-width': 1.6 },
      },
      before,
    );
  }

  private nameField(): ExpressionSpecification {
    return this.state.lang === 'en' ? ['coalesce', ['get', 'nameEn'], ['get', 'name']] : ['get', 'name'];
  }

  private addImages(): void {
    const ic = CONFIG.icons;
    const put = (id: string, img: ImageData) => {
      if (this.map.hasImage(id)) this.map.updateImage(id, img);
      else this.map.addImage(id, img, { pixelRatio: 2 });
    };
    for (const k of ICON_KINDS) {
      const glowPoi = (k === 'bar' && this.state.night) || (k === 'viewpoint' && this.state.golden);
      put(`poi-${k}`, iconImage(k, { size: ic.poiSize, glow: glowPoi ? 1 : 0 }));
      const hot = glowPoi ? 1 : 0.55;
      put(`feat-${k}`, iconImage(k, { size: ic.featuredSize, pin: true, glow: hot }));
      put(`feat-${k}-o`, withOpenDot(iconImage(k, { size: ic.featuredSize, pin: true, glow: hot }), ic.featuredSize));
    }
    put('landmark-big', iconImage('landmark', { size: ic.landmarkSize, glow: this.state.night ? 0.9 : 0.5 }));
  }

  private poiFilter(categories: Category[]): FilterSpecification {
    const kinds = categories.length ? categories.flatMap((c) => CHIP_KINDS[c]) : ICON_KINDS;
    const subs = Object.entries(SUB_KIND)
      .filter(([, k]) => kinds.includes(k))
      .map(([sub]) => sub);
    const base = ['all', ['in', ['get', 'class'], ['literal', ALLOWED_CLASSES]], ['in', ['get', 'subclass'], ['literal', subs]], ['has', 'name'], ['!', ['in', ['to-number', ['id'], 0], ['literal', this.skip.length ? this.skip : [-1]]]]];
    const rank = (n: number) => [...base, ['<=', ['coalesce', ['get', 'rank'], 99], n]];
    const r = CONFIG.places.poiRanks;
    return ['step', ['zoom'], rank(r[0]), 16, rank(r[1]), 17, rank(r[2]), 18, base] as unknown as FilterSpecification;
  }

  private featuredData(categories: Category[], openNow: boolean, nowMs: number): GeoJSON.FeatureCollection {
    const s = this.store;
    return {
      type: 'FeatureCollection',
      features: s.places.map((p) => ({
        type: 'Feature',
        properties: {
          id: p.id,
          name: p.name,
          nameEn: p.nameEn ?? p.name,
          icon: kindOfPlace(p.kind, p.category),
          major: !!p.major,
          fav: s.favourites.has(p.id),
          open: s.open(p.id, nowMs).state === 'open',
          vis: s.visible(p.id, { categories, openNow }, nowMs),
        },
        geometry: { type: 'Point', coordinates: p.lngLat },
      })),
    };
  }

  /** Filters, time (open now), language and light — cheap; only changed things are re-sent. */
  update(f: { categories: Category[]; openNow: boolean; nowMs: number; night: number; golden: number; lang: 'tr' | 'en' }): void {
    const map = this.map;
    const night = f.night > 0.5;
    const golden = f.golden > 0.35 && !night;
    const minute = Math.floor(f.nowMs / 60_000);
    const key = `${f.categories.join()}|${f.openNow}|${minute}|${[...this.store.favourites].join()}`;
    if (key !== this.state.key) {
      this.state.key = key;
      (map.getSource(FEATURED_SOURCE) as GeoJSONSource).setData(this.featuredData(f.categories, f.openNow, f.nowMs));
      map.setFilter(LAYERS.poi, this.poiFilter(f.categories));
      // Map POIs carry no opening hours, so "open now" shows only places whose hours we know.
      map.setLayoutProperty(LAYERS.poi, 'visibility', f.openNow ? 'none' : 'visible');
    }
    if (night !== this.state.night || golden !== this.state.golden) {
      this.state.night = night;
      this.state.golden = golden;
      this.addImages();
      for (const l of [LAYERS.poi, LAYERS.featured, LAYERS.landmarks]) map.setPaintProperty(l, 'text-halo-color', haloColor(night));
      map.setPaintProperty(LAYERS.poi, 'text-color', textColor(night));
      map.setPaintProperty(LAYERS.featured, 'text-color', textColor(night));
      map.setPaintProperty(LAYERS.landmarks, 'text-color', night ? '#F3CB6B' : '#8A6410');
    }
    if (f.lang !== this.state.lang) {
      this.state.lang = f.lang;
      map.setLayoutProperty(LAYERS.featured, 'text-field', ['step', ['zoom'], '', CONFIG.places.featuredNamesFrom, this.nameField()]);
      map.setLayoutProperty(LAYERS.landmarks, 'text-field', this.nameField());
    }
  }

  /** What's under a tap: a featured place id, a landmark, or a map POI as a Place. */
  at(point: { x: number; y: number }): { featured: string } | { landmark: LandmarkProps & { lngLat: [number, number] } } | { poi: Place } | null {
    const r = 18;
    const box: [PointLike, PointLike] = [
      [point.x - r, point.y - r],
      [point.x + r, point.y + r],
    ];
    const near = (fs: MapGeoJSONFeature[]) => fs.sort((a, b) => this.dist(a, point) - this.dist(b, point))[0];
    const feat = near(this.map.queryRenderedFeatures(box, { layers: [LAYERS.featured] }));
    if (feat) return { featured: String(feat.properties.id) };
    const lm = near(this.map.queryRenderedFeatures(box, { layers: [LAYERS.landmarks] }));
    if (lm) return { landmark: { ...(lm.properties as LandmarkProps), lngLat: (lm.geometry as Point).coordinates as [number, number] } };
    const poi = near(this.map.queryRenderedFeatures(box, { layers: [LAYERS.poi] }));
    const p = poi && placeFromFeature(poi);
    return p ? { poi: p } : null;
  }

  private dist(f: MapGeoJSONFeature, p: { x: number; y: number }): number {
    const q = this.map.project((f.geometry as Point).coordinates as [number, number]);
    return Math.hypot(q.x - p.x, q.y - p.y - 12);
  }
}

/** Adds the small green "open now" dot at the shape's top-right. */
function withOpenDot(img: ImageData, size: number): ImageData {
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const g = cv.getContext('2d')!;
  g.putImageData(img, 0, 0);
  const dpr = 2;
  const r = (size / 2) * dpr;
  const cx = img.width / 2 + r * 0.72;
  const cy = img.width / 2 - r * 0.72;
  g.beginPath();
  g.arc(cx, cy, 5.5 * dpr, 0, Math.PI * 2);
  g.fillStyle = '#FFFFFF';
  g.fill();
  g.beginPath();
  g.arc(cx, cy, 3.8 * dpr, 0, Math.PI * 2);
  g.fillStyle = '#22B573';
  g.fill();
  return g.getImageData(0, 0, cv.width, cv.height);
}
