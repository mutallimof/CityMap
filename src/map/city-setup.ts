import type { Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection, MultiLineString, Point } from 'geojson';
import { CONFIG } from '../config';
import type { LandmarkProps } from '../data/load';
import { LAYER } from './style';
import { addCityImages, BUILDING_SOURCE, CITY_SOURCE, cityLayers, CityLook, LANDMARK_SOURCE, type CityIds } from './city';
import { BUILDINGS_PROTOCOL } from './buildings/protocol';
import { cityLook } from './city-look';
import { seasonOf } from '../weather/conditions';

const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a>';

export const OUTER_WATER = 'city-outer-water';

/** Ground layers go just above our land fill; lines / buildings / labels above the shore lines. */
const GROUND = new Set(['city-landuse', 'city-landcover', 'city-blossom', 'city-tulips']);

export function addCity(map: MlMap, landmarks: FeatureCollection<Point | MultiLineString, LandmarkProps>): CityLook {
  const ids: CityIds = {
    landmarkBuildings: landmarks.features.map((f) => f.properties.building).filter((x): x is number => typeof x === 'number'),
    tulipParks: landmarks.features.map((f) => f.properties.landcover).filter((x): x is number => typeof x === 'number'),
  };
  map.addSource(CITY_SOURCE, { type: 'vector', url: CONFIG.city.tiles, attribution: ATTRIBUTION });
  map.addSource(BUILDING_SOURCE, { type: 'vector', tiles: [`${BUILDINGS_PROTOCOL}://{z}/{x}/{y}`], minzoom: 13, maxzoom: 14 });
  map.addSource(LANDMARK_SOURCE, { type: 'geojson', data: landmarks });
  addCityImages(map);
  const palette = cityLook({ night: 0, golden: 0, season: seasonOf(new Date()), wet: 0, snow: 0, cloud: 0 });
  // Beyond our coastline box the map continues on OpenFreeMap's own water polygons (flat), drawn under the
  // water shader; the background is land-coloured. Inside the box the shader + our land cover it all.
  map.addLayer({ id: OUTER_WATER, type: 'fill', source: CITY_SOURCE, 'source-layer': 'water', paint: { 'fill-color': CONFIG.colors.day.water, 'fill-antialias': false } }, LAYER.land);
  for (const layer of cityLayers(palette, ids)) map.addLayer(layer, GROUND.has(layer.id) ? LAYER.innerShadow : LAYER.routes);
  return new CityLook(map, ids);
}

