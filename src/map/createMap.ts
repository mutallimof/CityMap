import { Map as MlMap, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CONFIG } from '../config';
import { buildStyle, SOURCE } from './style';
import { shorelineFromLand } from './shoreline';
import { addLabels, bindLabelZoomClasses } from './labels';
import { loadDistricts, loadLand, loadPiers } from '../data/load';

// MapLibre resolves its worker relative to its own module, which breaks under
// Vite's dep pre-bundling; point it at the emitted asset explicitly.
setWorkerUrl(workerUrl);

export async function createMap(container: HTMLElement): Promise<MlMap> {
  const [w, s, e, n] = CONFIG.bounds;
  const pad = CONFIG.camera.boundsPadding;
  const map = new MlMap({
    container,
    style: buildStyle(),
    center: CONFIG.camera.center,
    zoom: CONFIG.camera.zoom,
    pitch: CONFIG.camera.pitch,
    bearing: CONFIG.camera.bearing,
    minZoom: CONFIG.camera.minZoom,
    maxZoom: CONFIG.camera.maxZoom,
    maxPitch: CONFIG.camera.maxPitch,
    maxBounds: [w - pad, s - pad, e + pad, n + pad],
    attributionControl: { compact: false },
    // Smooth and crisp on high-DPI phones without blowing the fill-rate budget.
    pixelRatio: Math.min(window.devicePixelRatio, 2),
    fadeDuration: 0,
  });

  const [land, piers, districts] = await Promise.all([
    loadLand(),
    loadPiers(),
    loadDistricts(),
    new Promise<void>((resolve) => map.once('load', () => resolve())),
  ]);

  (map.getSource(SOURCE.land) as GeoJSONSource).setData(land);
  (map.getSource(SOURCE.shore) as GeoJSONSource).setData(shorelineFromLand(land, CONFIG.bounds));
  (map.getSource(SOURCE.piers) as GeoJSONSource).setData(piers);

  addLabels(map, 'district', districts);
  addLabels(map, 'pier', piers);
  bindLabelZoomClasses(map);

  return map;
}
