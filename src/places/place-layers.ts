import { look } from '../themes';
import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, Map as MlMap, MapGeoJSONFeature, PointLike } from 'maplibre-gl';
import type { FeatureCollection, MultiLineString, Point } from 'geojson';
import { CONFIG } from '../config';
import { filtersActive, placeVisible, poisVisible, storiesVisible } from './filters';
import { CITY_SOURCE, LANDMARK_SOURCE } from '../map/city';
import type { LandmarkProps } from '../data/load';
import { osmFromTileId } from '../osm/nominatim';
import type { Category } from '../ui/store';
import { ICON_KINDS, iconImage, kindOfPlace, POI_KINDS, storyIcon, type IconKind } from './icons';
import type { Story } from '../stories/stories';
import { events, NO_EVENT_FILTERS, type EventFilters } from '../events/events';
import type { PlacesStore } from './store';
import type { Place, PlaceCategory } from './types';

/**
 * All place icons and their names are MapLibre symbols in one collision space, so nothing ever
 * overlaps: featured places (big glowing pins) > landmarks > map POIs. Only visitor-relevant OSM
 * POIs are shown (cafés, restaurants, bars, bakeries, museums, galleries, theatres, cinemas,
 * malls / bazaars, parks, viewpoints, landmarks); they appear by zoom and OpenMapTiles rank, with
 * names only for the most important.
 */
export const LAYERS = { poi: 'poi', stories: 'stories', landmarks: 'landmark-icons', featured: 'featured' } as const;

/**
 * Importance of a featured pin when zoomed out: 0 = well known (Wikidata / high importance) or a venue
 * with an event today, or any match while a filter is on; 1 = hand-curated places and event venues;
 * 2 = auto-picked places. Lower ranks appear first (CONFIG.places.rankZooms).
 */
export function featuredRank(p: { major?: boolean; auto?: boolean }, filtered: boolean, eventToday: boolean): number {
  if (p.major || filtered || eventToday) return 0;
  return p.auto ? 2 : 1;
}
const STORY_SOURCE = 'stories';
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

const textColor = (night: boolean) => (night ? look().labels.poiNight : look().labels.poi);
const haloColor = (night: boolean) => (night ? look().labels.poiHaloNight : look().labels.poiHalo);
const landmarkColor = (night: boolean) => (night ? look().labels.landmarkNight : look().labels.landmark);
const storyColor = (night: boolean) => (night ? look().labels.storyNight : look().labels.story);

/**
 * Featured pin size by zoom. Bubble pins "bounce in": as each rank appears (CONFIG.places.rankZooms /
 * allPinsZoom) its pins overshoot a little and settle within half a zoom level (pure function of zoom, so it
 * plays as you zoom in and never runs on its own).
 */
export function featuredSize(): ExpressionSpecification {
  const base = (z: number) => (z <= 11 ? 0.72 : z <= 14 ? 0.72 + ((z - 11) / 3) * 0.18 : z <= 16 ? 0.9 + ((z - 14) / 2) * 0.1 : 1);
  if (look().style.pins !== 'bubble') return ['interpolate', ['linear'], ['zoom'], 11, 0.72, 14, 0.9, 16, 1];
  const p = CONFIG.places;
  const appear: [number, number][] = [
    [1, p.rankZooms[0]],
    [2, p.rankZooms[1]],
  ];
  const stops = new Set<number>([10, 11, 14, 16]);
  for (const [, z] of appear) for (const d of [0, 0.18, 0.4]) stops.add(Math.round((z + d) * 100) / 100);
  const bounce = (dz: number) => (dz < 0 ? 0.5 : dz < 0.18 ? 0.5 + (dz / 0.18) * 0.68 : dz < 0.4 ? 1.18 - ((dz - 0.18) / 0.22) * 0.18 : 1);
  const out: unknown[] = ['interpolate', ['linear'], ['zoom']];
  for (const z of [...stops].sort((a, b) => a - b)) {
    const cases: unknown[] = ['case'];
    for (const [rank, az] of appear) cases.push(['==', ['get', 'rank'], rank], Math.round(base(z) * bounce(z - az) * 1000) / 1000);
    cases.push(base(z));
    out.push(z, cases);
  }
  return out as ExpressionSpecification;
}

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
          'text-font': [...look().labels.placeFont],
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
        minzoom: look().city.landmarkLabelsFrom - 1,
        filter: this.landmarkFilter(),
        layout: {
          'icon-image': 'landmark-big',
          'icon-padding': 2,
          'text-field': this.nameField(),
          'text-font': [...look().labels.placeFont],
          'text-size': 12.5,
          'text-offset': [0, 1.3],
          'text-anchor': 'top',
          'text-max-width': 9,
          'text-optional': true,
          'symbol-sort-key': 0,
        },
        paint: { 'text-color': landmarkColor(false), 'text-halo-color': haloColor(false), 'text-halo-width': 1.6 },
      },
      before,
    );

    map.addSource(FEATURED_SOURCE, { type: 'geojson', data: this.featuredData([], false, Date.now()) });
    map.addLayer(
      {
        id: LAYERS.featured,
        type: 'symbol',
        source: FEATURED_SOURCE,
        // Zoomed out: places fade in by rank (0 = well known or an event today, 1 = curated, 2 = auto-picked);
        // collisions keep them apart and the sort key lets the more important pin win.
        filter: ['all', ['get', 'vis'], ['step', ['zoom'], ['<=', ['get', 'rank'], 0], p.rankZooms[0], ['<=', ['get', 'rank'], 1], p.rankZooms[1], ['<=', ['get', 'rank'], 2], p.allPinsZoom, true]] as unknown as FilterSpecification,
        layout: {
          'icon-image': [
            'step',
            ['zoom'],
            ['concat', 'featm-', ['get', 'icon'], ['case', ['get', 'ev'], '-ev', ''], ['case', ['get', 'open'], '-o', '']],
            p.allPinsZoom,
            ['concat', 'feat-', ['get', 'icon'], ['case', ['get', 'ev'], '-ev', ''], ['case', ['get', 'open'], '-o', '']],
          ],
          'icon-anchor': 'bottom',
          'icon-size': featuredSize(),
          'icon-padding': 2,
          'text-field': ['step', ['zoom'], '', p.featuredNamesFrom, this.nameField()],
          'text-font': [...look().labels.placeFont],
          'text-size': 12.5,
          'text-anchor': 'top',
          'text-offset': [0, 0.3],
          'text-max-width': 9,
          'text-optional': true,
          // Placement priority: favourites, then venues with an event today, then by rank.
          'symbol-sort-key': ['case', ['get', 'fav'], -2, ['get', 'ev'], -1, ['get', 'rank']],
        },
        paint: {
          'text-color': textColor(false),
          'text-halo-color': haloColor(false),
          'text-halo-width': 1.6,
          // Each rank fades in over half a zoom level as it appears.
          'icon-opacity': ['interpolate', ['linear'], ['zoom'], p.rankZooms[0], ['case', ['<=', ['get', 'rank'], 0], 1, 0], p.rankZooms[0] + 0.5, ['case', ['<=', ['get', 'rank'], 1], 1, 0], p.rankZooms[1], ['case', ['<=', ['get', 'rank'], 1], 1, 0], p.rankZooms[1] + 0.5, 1],
        },
      },
      before,
    );
  }

  /** Places drawn as hero models in the active look (their pins / stars / story markers step aside). */
  private heroes = { places: new Set<string>(), osm: new Set<string>(), landmarks: new Set<string>() };
  private stories: Story[] = [];
  setHeroes(h: { place: string | null; osm: string; id: string }[]): void {
    this.heroes = { places: new Set(h.map((x) => x.place).filter((x): x is string => !!x)), osm: new Set(h.map((x) => x.osm)), landmarks: new Set(h.map((x) => x.id)) };
    this.state.key = '';
    if (this.map.getLayer(LAYERS.landmarks)) this.map.setFilter(LAYERS.landmarks, this.landmarkFilter());
    if (this.stories.length) this.setStories(this.stories);
  }

  private landmarkFilter(): FilterSpecification {
    return ['all', ['==', ['geometry-type'], 'Point'], ['!=', ['get', 'kind'], 'tulips'], ['!', ['in', ['get', 'id'], ['literal', [...this.heroes.landmarks]]]]];
  }

  private nameField(): ExpressionSpecification {
    return this.state.lang === 'en' ? ['coalesce', ['get', 'nameEn'], ['get', 'name']] : ['get', 'name'];
  }

  private addImages(): void {
    const ic = CONFIG.icons;
    // Same-size images update in place; a size change (a glow margin at night, another pin style) re-adds.
    const put = (id: string, img: ImageData) => {
      const old = this.map.hasImage(id) ? this.map.getImage(id) : null;
      if (old && old.data.width === img.width && old.data.height === img.height) return this.map.updateImage(id, img);
      if (old) this.map.removeImage(id);
      this.map.addImage(id, img, { pixelRatio: 2 });
    };
    for (const k of ICON_KINDS) {
      const glowPoi = (k === 'bar' && this.state.night) || (k === 'viewpoint' && this.state.golden);
      put(`poi-${k}`, iconImage(k, { size: ic.poiSize, glow: glowPoi ? 1 : 0 }));
      // Bubbles stay clean: only an event today (or a bar at night / a viewpoint at sunset) glows.
      const hot = glowPoi ? 1 : look().style.pins === 'bubble' ? 0 : 0.55;
      put(`feat-${k}`, iconImage(k, { size: ic.featuredSize, pin: true, glow: hot }));
      // Compact pins for city zoom: no glow margin, so collision boxes are the pin itself and many more
      // fit; venues with an event today keep a (smaller) warm glow.
      const mini = ic.featuredSize * ic.miniScale;
      put(`featm-${k}`, iconImage(k, { size: mini, pin: true }));
      put(`featm-${k}-o`, withOpenDot(iconImage(k, { size: mini, pin: true }), mini));
      put(`featm-${k}-ev`, iconImage(k, { size: mini, pin: true, glow: 1.2, glowColor: look().icons.eventGlow }));
      put(`featm-${k}-ev-o`, withOpenDot(iconImage(k, { size: mini, pin: true, glow: 1.2, glowColor: look().icons.eventGlow }), mini));
      put(`feat-${k}-o`, withOpenDot(iconImage(k, { size: ic.featuredSize, pin: true, glow: hot }), ic.featuredSize));
      // A venue with an event today glows warm gold.
      put(`feat-${k}-ev`, iconImage(k, { size: ic.featuredSize, pin: true, glow: 1.4, glowColor: look().icons.eventGlow }));
      put(`feat-${k}-ev-o`, withOpenDot(iconImage(k, { size: ic.featuredSize, pin: true, glow: 1.4, glowColor: look().icons.eventGlow }), ic.featuredSize));
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
    return ['step', ['zoom'], rank(r[0]), 15, rank(r[1]), 16, rank(r[2]), 17, rank(r[3]), 18, base] as unknown as FilterSpecification;
  }

  private featuredData(categories: Category[], openNow: boolean, nowMs: number, ev: EventFilters = NO_EVENT_FILTERS): GeoJSON.FeatureCollection {
    const f = { categories, openNow, ev };
    const active = filtersActive(f);
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
          // With a filter on, every match shows at any zoom (not only the well-known ones), so picking a
          // chip never leaves an empty map when zoomed out; collisions keep it tidy.
          major: !!p.major || active,
          rank: featuredRank(p, active, events.status(p.id, nowMs) !== null),
          fav: s.favourites.has(p.id),
          open: s.open(p.id, nowMs).state === 'open',
          // A hero landmark model (toy themes) stands in for its pin; tapping the model opens the place.
          vis: placeVisible(s, p.id, f, nowMs) && !this.heroes.places.has(p.id),
          ev: events.status(p.id, nowMs) !== null,
        },
        geometry: { type: 'Point', coordinates: p.lngLat },
      })),
    };
  }

  /** Filters, time (open now), language and light — cheap; only changed things are re-sent. */
  update(f: { categories: Category[]; openNow: boolean; nowMs: number; night: number; golden: number; lang: 'tr' | 'en'; ev: EventFilters }): void {
    const map = this.map;
    const night = f.night > 0.5;
    const golden = f.golden > 0.35 && !night;
    const minute = Math.floor(f.nowMs / 60_000);
    const key = `${f.categories.join()}|${f.openNow}|${minute}|${[...this.store.favourites].join()}|${JSON.stringify(f.ev)}|${events.all.length}`;
    if (key !== this.state.key) {
      this.state.key = key;
      (map.getSource(FEATURED_SOURCE) as GeoJSONSource).setData(this.featuredData(f.categories, f.openNow, f.nowMs, f.ev));
      map.setFilter(LAYERS.poi, this.poiFilter(f.categories));
      // Map POIs carry no opening hours or events; story markers are Culture.
      const ff = { categories: f.categories, openNow: f.openNow, ev: f.ev };
      map.setLayoutProperty(LAYERS.poi, 'visibility', poisVisible(ff) ? 'visible' : 'none');
      if (map.getLayer(LAYERS.stories)) map.setLayoutProperty(LAYERS.stories, 'visibility', storiesVisible(ff) ? 'visible' : 'none');
    }
    if (night !== this.state.night || golden !== this.state.golden) {
      this.state.night = night;
      this.state.golden = golden;
      this.addImages();
      for (const l of [LAYERS.poi, LAYERS.featured, LAYERS.landmarks]) map.setPaintProperty(l, 'text-halo-color', haloColor(night));
      map.setPaintProperty(LAYERS.poi, 'text-color', textColor(night));
      map.setPaintProperty(LAYERS.featured, 'text-color', textColor(night));
      map.setPaintProperty(LAYERS.landmarks, 'text-color', landmarkColor(night));
      if (map.getLayer(LAYERS.stories)) {
        map.setPaintProperty(LAYERS.stories, 'text-color', storyColor(night));
        map.setPaintProperty(LAYERS.stories, 'text-halo-color', haloColor(night));
      }
    }
    if (f.lang !== this.state.lang) {
      this.state.lang = f.lang;
      map.setLayoutProperty(LAYERS.featured, 'text-field', ['step', ['zoom'], '', CONFIG.places.featuredNamesFrom, this.nameField()]);
      map.setLayoutProperty(LAYERS.landmarks, 'text-field', this.nameField());
      if (map.getLayer(LAYERS.stories)) map.setLayoutProperty(LAYERS.stories, 'text-field', ['step', ['zoom'], '', CONFIG.places.storyNamesFrom, this.nameField()]);
    }
  }

  /** Theme switch: icons, label colours and fonts. */
  retheme(): void {
    const map = this.map;
    const night = this.state.night;
    map.setLayoutProperty(LAYERS.featured, 'icon-size', featuredSize());
    this.addImages();
    if (map.hasImage('story')) {
      map.removeImage('story');
      map.addImage('story', storyIcon(CONFIG.icons.storySize), { pixelRatio: 2 });
    }
    const font = [...look().labels.placeFont];
    for (const l of [LAYERS.poi, LAYERS.featured, LAYERS.landmarks]) {
      map.setLayoutProperty(l, 'text-font', font);
      map.setPaintProperty(l, 'text-halo-color', haloColor(night));
    }
    map.setPaintProperty(LAYERS.poi, 'text-color', textColor(night));
    map.setPaintProperty(LAYERS.featured, 'text-color', textColor(night));
    map.setPaintProperty(LAYERS.landmarks, 'text-color', landmarkColor(night));
    if (map.getLayer(LAYERS.stories)) {
      map.setLayoutProperty(LAYERS.stories, 'text-font', [...look().labels.storyFont]);
      map.setPaintProperty(LAYERS.stories, 'text-color', storyColor(night));
      map.setPaintProperty(LAYERS.stories, 'text-halo-color', haloColor(night));
    }
  }

  /** Ids of the featured pins actually drawn right now (after zoom filters and collisions). */
  renderedFeatured(): Set<string> {
    if (!this.map.getLayer(LAYERS.featured)) return new Set();
    return new Set(this.map.queryRenderedFeatures({ layers: [LAYERS.featured] }).map((f) => String(f.properties?.id)));
  }

  /** What's under a tap: a featured place id, a landmark, or a map POI as a Place. */
  /**
   * Historic places with a story (Wikipedia/Wikidata) get a subtle gold book marker, above map POIs
   * and below landmarks / featured places; their tile POIs are skipped so nothing doubles up.
   */
  setStories(list: Story[]): void {
    this.stories = list;
    const map = this.map;
    const featured = new Set(this.store.places.map((p) => p.osm));
    const data: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: list
        .filter((st) => !featured.has(st.osm) && !this.heroes.osm.has(st.osm))
        .map((st) => ({ type: 'Feature', properties: { osm: st.osm, name: st.name.tr || st.name.en, nameEn: st.name.en || st.name.tr, kind: st.kind }, geometry: { type: 'Point', coordinates: st.lngLat } })),
    };
    this.skip = [...new Set([...this.skip, ...list.map((st) => tileIdFromOsm(st.osm)).filter((x): x is number => x !== null)])];
    this.state.key = ''; // re-apply the POI filter with the new skip list on the next update
    if (map.getSource(STORY_SOURCE)) {
      (map.getSource(STORY_SOURCE) as GeoJSONSource).setData(data);
      return;
    }
    if (!map.hasImage('story')) map.addImage('story', storyIcon(CONFIG.icons.storySize), { pixelRatio: 2 });
    map.addSource(STORY_SOURCE, { type: 'geojson', data });
    map.addLayer(
      {
        id: LAYERS.stories,
        type: 'symbol',
        source: STORY_SOURCE,
        minzoom: CONFIG.places.storiesFrom,
        layout: {
          'icon-image': 'story',
          'icon-size': ['interpolate', ['linear'], ['zoom'], CONFIG.places.storiesFrom, 0.75, 16, 1],
          'icon-padding': 4,
          'text-field': ['step', ['zoom'], '', CONFIG.places.storyNamesFrom, this.nameField()],
          'text-font': [...look().labels.storyFont],
          'text-size': 11.5,
          'text-offset': [0, 1.0],
          'text-anchor': 'top',
          'text-max-width': 9,
          'text-optional': true,
        },
        paint: { 'text-color': storyColor(this.state.night), 'text-halo-color': haloColor(this.state.night), 'text-halo-width': 1.5 },
      },
      LAYERS.landmarks,
    );
  }

  at(point: { x: number; y: number }): { featured: string } | { landmark: LandmarkProps & { lngLat: [number, number] } } | { story: string } | { poi: Place } | null {
    const r = 18;
    const box: [PointLike, PointLike] = [
      [point.x - r, point.y - r],
      [point.x + r, point.y + r],
    ];
    const near = (fs: MapGeoJSONFeature[]) => fs.sort((a, b) => this.dist(a, point) - this.dist(b, point))[0];
    const feat = near(this.map.queryRenderedFeatures(box, { layers: [LAYERS.featured] }));
    if (feat) return { featured: String(feat.properties.id) };
    if (this.map.getLayer(LAYERS.stories)) {
      const st = near(this.map.queryRenderedFeatures(box, { layers: [LAYERS.stories] }));
      if (st) return { story: String(st.properties.osm) };
    }
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
