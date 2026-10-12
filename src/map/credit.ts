import type { Map as MlMap } from 'maplibre-gl';

/**
 * Adds / removes a credit line in the map's attribution bar. MapLibre only lists the attribution of
 * sources a layer uses, so the credit rides on an empty GeoJSON source with an invisible circle layer.
 */
export function setCredit(map: MlMap, id: string, html: string, on: boolean): void {
  const apply = () => {
    const has = !!map.getSource(id);
    if (on && !has) {
      map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: html });
      map.addLayer({ id, type: 'circle', source: id, paint: { 'circle-radius': 0 } });
    } else if (!on && has) {
      map.removeLayer(id);
      map.removeSource(id);
    }
  };
  if (map.isStyleLoaded()) apply();
  else map.once('idle', apply);
}
