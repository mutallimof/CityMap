import type { Map as MlMap } from 'maplibre-gl';

const SOURCE = 'sound-credit';

/**
 * While sound is on, the map's attribution line credits the recordings (some are CC BY) and links the full
 * list (`audio/credits.html`, generated with the files). An empty source carries the attribution.
 */
export function showSoundCredit(map: MlMap, on: boolean): void {
  const apply = () => {
    const has = !!map.getSource(SOURCE);
    if (on && !has) {
      const href = `${import.meta.env.BASE_URL}audio/credits.html`;
      map.addSource(SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        attribution: `<a href="${href}" target="_blank" rel="noopener">Sounds: Wikimedia Commons (CC0 / PD / CC BY)</a>`,
      });
      // Attribution only counts sources used by a layer.
      map.addLayer({ id: SOURCE, type: 'circle', source: SOURCE, paint: { 'circle-radius': 0 } });
    } else if (!on && has) {
      map.removeLayer(SOURCE);
      map.removeSource(SOURCE);
    }
  };
  if (map.isStyleLoaded()) apply();
  else map.once('idle', apply);
}
