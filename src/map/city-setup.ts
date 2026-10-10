import { Marker, type Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection, MultiLineString, Point } from 'geojson';
import { CONFIG } from '../config';
import type { LandmarkProps } from '../data/load';
import { LAYER } from './style';
import { addCityImages, CITY_SOURCE, cityLayers, CityLook, LANDMARK_SOURCE, type CityIds } from './city';
import { cityLook } from './city-look';
import { seasonOf } from '../weather/conditions';

const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

/** Ground layers go just above our land fill; lines / buildings / labels above the shore lines. */
const GROUND = new Set(['city-landuse', 'city-landcover', 'city-blossom', 'city-tulips']);

export function addCity(map: MlMap, landmarks: FeatureCollection<Point | MultiLineString, LandmarkProps>): CityLook {
  const ids: CityIds = {
    landmarkBuildings: landmarks.features.map((f) => f.properties.building).filter((x): x is number => typeof x === 'number'),
    tulipParks: landmarks.features.map((f) => f.properties.landcover).filter((x): x is number => typeof x === 'number'),
  };
  map.addSource(CITY_SOURCE, { type: 'vector', url: CONFIG.city.tiles, attribution: ATTRIBUTION });
  map.addSource(LANDMARK_SOURCE, { type: 'geojson', data: landmarks });
  addCityImages(map);
  const palette = cityLook({ night: 0, golden: 0, season: seasonOf(new Date()), wet: 0, snow: 0, cloud: 0 });
  for (const layer of cityLayers(palette, ids)) map.addLayer(layer, GROUND.has(layer.id) ? LAYER.innerShadow : LAYER.routes);
  addLandmarkLabels(map, landmarks);
  return new CityLook(map, ids);
}

const ICON: Record<string, string> = { tower: '🗼', bridge: '🌉', tulips: '🌷' };

function addLandmarkLabels(map: MlMap, data: FeatureCollection<Point | MultiLineString, LandmarkProps>): void {
  for (const f of data.features) {
    if (f.geometry.type !== 'Point' || !f.properties.name) continue;
    const el = document.createElement('div');
    el.className = `map-label map-label--landmark map-label--${f.properties.kind}`;
    el.dataset.name = f.properties.name;
    el.dataset.nameEn = f.properties.nameEn ?? f.properties.name;
    el.innerHTML = `<span aria-hidden="true">${ICON[f.properties.kind] ?? '★'}</span> <b></b>`;
    el.querySelector('b')!.textContent = f.properties.name;
    new Marker({ element: el, anchor: 'bottom', offset: [0, -6] }).setLngLat(f.geometry.coordinates as [number, number]).addTo(map);
  }
  const root = map.getContainer();
  const update = () => root.classList.toggle('show-landmark-labels', map.getZoom() >= CONFIG.city.landmarkLabelsFrom);
  map.on('zoom', update);
  update();
}

/** Switch landmark label language (TR / EN). */
export function setLandmarkLang(lang: 'tr' | 'en'): void {
  document.querySelectorAll<HTMLElement>('.map-label--landmark').forEach((el) => {
    el.querySelector('b')!.textContent = (lang === 'en' ? el.dataset.nameEn : el.dataset.name) ?? '';
  });
}
