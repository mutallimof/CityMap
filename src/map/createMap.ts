import { Map as MlMap, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CONFIG } from '../config';
import { buildStyle, SOURCE } from './style';
import { initialCamera } from './intro';
import { shorelineFromLand } from './shoreline';
import { addLabels, bindLabelZoomClasses } from './labels';
import { loadDistricts, loadLand, loadLandmarks, loadPiers, type DistrictProps, type LandmarkProps, type PierProps } from '../data/load';
import { addCity } from './city-setup';
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
    fadeDuration: 0,
  });

  const [land, piers, districts, landmarks] = await Promise.all([
    loadLand(),
    loadPiers(),
    loadDistricts(),
    loadLandmarks(),
    new Promise<void>((resolve) => map.once('load', () => resolve())),
  ]);

  (map.getSource(SOURCE.land) as GeoJSONSource).setData(land);
  (map.getSource(SOURCE.shore) as GeoJSONSource).setData(shorelineFromLand(land, CONFIG.bounds));
  (map.getSource(SOURCE.piers) as GeoJSONSource).setData(piers);

  const city = addCity(map, landmarks);
  addLabels(map, 'district', districts);
  addLabels(map, 'pier', piers);
  bindLabelZoomClasses(map);

  return { map, piers, land, city, districts, landmarks };
}
