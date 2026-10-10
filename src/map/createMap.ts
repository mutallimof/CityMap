import { Map as MlMap, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CONFIG } from '../config';
import { buildStyle, SOURCE } from './style';
import { initialCamera } from './intro';
import { shorelineFromLand } from './shoreline';
import { addMapLabels } from './labels';
import { loadDistricts, loadLand, loadLandmarks, loadPiers, type DistrictProps, type LandmarkProps, type PierProps } from '../data/load';
import { addCity } from './city-setup';
import { registerBuildingsProtocol } from './buildings/protocol';
import type { CityLook } from './city';
import type { FeatureCollection, MultiLineString, MultiPolygon, Point, Polygon } from 'geojson';

// MapLibre resolves its worker relative to its own module, which breaks under
// Vite's dep pre-bundling; point it at the emitted asset explicitly.
setWorkerUrl(workerUrl);

export async function createMap(container: HTMLElement, withIntro = false): Promise<{ map: MlMap; piers: FeatureCollection<Point, PierProps>; land: FeatureCollection<Polygon | MultiPolygon>; city: CityLook; districts: FeatureCollection<Point, DistrictProps>; landmarks: FeatureCollection<Point | MultiLineString, LandmarkProps> }> {
  const [w, s, e, n] = CONFIG.bounds;
  const pad = CONFIG.camera.boundsPadding;
  const map = new MlMap({
    container,
    style: buildStyle(),
    ...initialCamera(withIntro),
    minZoom: CONFIG.camera.minZoom,
    maxZoom: CONFIG.camera.maxZoom,
    maxPitch: CONFIG.camera.maxPitch,
    maxBounds: [w - pad, s - pad, e + pad, n + pad],
    attributionControl: { compact: false },
    // Smooth and crisp on high-DPI phones without blowing the fill-rate budget.
    pixelRatio: Math.min(window.devicePixelRatio, CONFIG.perf.maxPixelRatio),
    // Symbols (places, labels) fade in and out gently as collisions resolve.
    fadeDuration: 260,
  });

  const [land, piers, districts, landmarks] = await Promise.all([
    // Tile template for the building re-packer must be known before the source is added.
    loadLand(),
    loadPiers(),
    loadDistricts(),
    loadLandmarks(),
    new Promise<void>((resolve) => map.once('load', () => resolve())),
    registerBuildingsProtocol(),
  ]);

  (map.getSource(SOURCE.land) as GeoJSONSource).setData(land);
  (map.getSource(SOURCE.shore) as GeoJSONSource).setData(shorelineFromLand(land, CONFIG.bounds));
  (map.getSource(SOURCE.piers) as GeoJSONSource).setData(piers);

  const city = addCity(map, landmarks);
  addMapLabels(map, districts, piers);

  return { map, piers, land, city, districts, landmarks };
}
