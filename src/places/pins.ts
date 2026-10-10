import { Marker, type Map as MlMap } from 'maplibre-gl';
import { CONFIG } from '../config';
import { iconCanvas, kindOfPlace } from './icons';
import type { Place } from './types';

/**
 * The selected place: its icon, bigger, with a soft pulsing ring (DOM marker on top of the
 * symbol layers). Never transform/transition the marker root — MapLibre positions it.
 */
export class SelectedPlaceMarker {
  private el = document.createElement('div');
  private marker: Marker;
  private id = '';
  constructor(private map: MlMap) {
    this.el.className = 'sel-pin';
    this.el.innerHTML = '<span class="sel-pin__inner"><span class="sel-pin__ring"></span></span>';
    this.marker = new Marker({ element: this.el, anchor: 'bottom' }).setLngLat([0, 0]);
  }

  show(p: Place | null): void {
    if (!p) {
      if (this.id) this.marker.remove();
      this.id = '';
      return;
    }
    if (p.id === this.id) return;
    this.id = p.id;
    const inner = this.el.querySelector('.sel-pin__inner')!;
    inner.querySelector('canvas')?.remove();
    const cv = iconCanvas(kindOfPlace(p.kind, p.category), { size: CONFIG.icons.featuredSize * 1.15, pin: true, glow: 0.8 });
    cv.style.width = `${cv.width / 2}px`;
    cv.style.height = `${cv.height / 2}px`;
    inner.appendChild(cv);
    this.marker.setLngLat(p.lngLat).addTo(this.map);
  }
}
