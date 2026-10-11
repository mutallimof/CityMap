import { Marker, type Map as MlMap } from 'maplibre-gl';

/**
 * "Happening now" pulse under a venue's pin: a few DOM rings (only venues with an event on right
 * now — a handful at most). The marker root is positioned by MapLibre; only the inner ring animates.
 */
export class EventPulses {
  private markers = new Map<string, Marker>();
  constructor(private map: MlMap) {}

  update(now: { id: string; lngLat: [number, number] }[]): void {
    const keep = new Set(now.map((n) => n.id));
    for (const [id, m] of this.markers) if (!keep.has(id)) (m.remove(), this.markers.delete(id));
    for (const n of now) {
      if (this.markers.has(n.id)) continue;
      const el = document.createElement('div');
      el.className = 'evpulse';
      el.innerHTML = '<span class="evpulse__ring"></span><span class="evpulse__ring evpulse__ring--2"></span>';
      this.markers.set(n.id, new Marker({ element: el, anchor: 'center', pitchAlignment: 'map', rotationAlignment: 'map' }).setLngLat(n.lngLat).addTo(this.map));
    }
  }
}
