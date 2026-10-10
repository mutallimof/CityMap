import { Marker, type Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import { CONFIG } from '../config';

export interface LabelProps {
  name: string;
}

export type LabelKind = 'district' | 'pier';

/**
 * Labels are DOM markers rather than MapLibre symbol layers: the style needs no
 * glyph server, and the self-hosted Nunito webfont renders Turkish characters
 * (İ ı ş ğ ç ö ü) natively. We only ever show a few dozen, so DOM cost is negligible.
 * Visibility by zoom is a CSS class on the map container.
 */
export function addLabels(map: MlMap, kind: LabelKind, data: FeatureCollection<Point, LabelProps>): void {
  for (const f of data.features) {
    const el = document.createElement('div');
    el.className = `map-label map-label--${kind}`;
    el.textContent = f.properties.name;
    new Marker({ element: el, anchor: kind === 'pier' ? 'top' : 'center', offset: kind === 'pier' ? [0, 8] : [0, 0] })
      .setLngLat(f.geometry.coordinates as [number, number])
      .addTo(map);
  }
}

/** Toggle label classes on the container as zoom crosses the configured thresholds. */
export function bindLabelZoomClasses(map: MlMap): void {
  const root = map.getContainer();
  const update = () => {
    const z = map.getZoom();
    root.classList.toggle('show-district-labels', z >= CONFIG.labels.districtMinZoom && z <= CONFIG.labels.districtMaxZoom);
    root.classList.toggle('show-pier-labels', z >= CONFIG.piers.labelMinZoom);
  };
  map.on('zoom', update);
  update();
}
