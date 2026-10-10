import { Marker, type Map as MlMap } from 'maplibre-gl';
import { CONFIG } from '../config';
import { POI_ICON } from './poi-layer';
import type { PlaceFilters, PlacesStore } from './store';
import type { Place } from './types';

export const CATEGORY_ICON: Record<string, string> = {
  food: '🍽',
  culture: '🎭',
  shopping: '🛍',
  park: '🌳',
  view: '🌅',
};

export const KIND_ICON: Record<string, string> = {
  cafe: '☕',
  restaurant: '🍽',
  theatre: '🎭',
  arts_centre: '🎨',
  concert_hall: '🎻',
  venue: '🎭',
  museum: '🏛',
  gallery: '🖼',
  mall: '🛍',
  bazaar: '🧺',
  viewpoint: '🌅',
  ...POI_ICON,
};

export interface PinFilters extends PlaceFilters {
  selectedId: string | null;
  golden: number;
  night: number;
  nowMs: number;
}

/**
 * Featured place pins (DOM markers): a round bubble with the kind icon, a green dot when open
 * now (OSM opening hours), a heart for favourites, sunset spots that glow during golden hour.
 * Zoomed out only well-known places show; visibility follows zoom + filters.
 */
export class PlacePins {
  private els = new Map<string, HTMLElement>();
  private markers: Marker[] = [];

  constructor(
    private map: MlMap,
    private store: PlacesStore,
    private onTap: (p: Place) => void,
  ) {
    for (const p of store.places) {
      // MapLibre owns the root element's transform (positioning); visuals live on .pin__inner.
      const el = document.createElement('button');
      el.className = `pin pin--${p.category}${p.major ? ' pin--major' : ''}`;
      el.type = 'button';
      el.setAttribute('aria-label', p.name);
      el.innerHTML = `<span class="pin__inner"><span class="pin__ring"></span><span class="pin__bubble">${KIND_ICON[p.kind] ?? CATEGORY_ICON[p.category]}</span><span class="pin__open"></span><span class="pin__fav">♥</span><span class="pin__tail"></span><span class="pin__label"></span></span>`;
      (el.querySelector('.pin__label') as HTMLElement).textContent = p.name;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onTap(p);
      });
      this.els.set(p.id, el);
      this.markers.push(new Marker({ element: el, anchor: 'bottom' }).setLngLat(p.lngLat).addTo(map));
    }
    map.on('zoom', () => this.applyZoom());
    let pending = 0;
    map.on('move', () => {
      if (pending) return;
      pending = window.setTimeout(() => ((pending = 0), this.declutter()), 120);
    });
    this.applyZoom();
  }

  /** Pins visible + their priority; recomputed in update(). */
  private priority = new Map<string, number>();

  /**
   * Screen-space declutter: walk pins by priority and shrink any pin that lands within
   * `declutterPx` of one already kept (selected / live / fresh / saved pins win).
   */
  private declutter(): void {
    const minD = CONFIG.places.declutterPx;
    const kept: { x: number; y: number }[] = [];
    const order = [...this.priority.entries()].sort((a, b) => b[1] - a[1]);
    for (const [id, prio] of order) {
      const el = this.els.get(id)!;
      if (prio < 0) {
        el.classList.remove('pin--crowded');
        continue;
      }
      const p = this.map.project(this.store.byId.get(id)!.lngLat);
      const crowded = kept.some((k) => Math.abs(k.x - p.x) < minD && Math.abs(k.y - p.y) < minD);
      el.classList.toggle('pin--crowded', crowded);
      if (!crowded) kept.push(p);
    }
  }

  private applyZoom(): void {
    const z = this.map.getZoom();
    const root = this.map.getContainer();
    root.classList.toggle('pins-far', z < CONFIG.places.allPinsZoom);
    root.classList.toggle('pins-labels', z >= CONFIG.places.labelZoom);
  }

  /** Refresh classes from filters + opening hours (cheap; a few dozen elements). */
  update(f: PinFilters): void {
    for (const p of this.store.places) {
      const el = this.els.get(p.id)!;
      const visible = this.store.visible(p.id, f, f.nowMs);
      const open = this.store.open(p.id, f.nowMs).state === 'open';
      const fav = this.store.favourites.has(p.id);
      const golden = p.category === 'view' && f.golden > 0.35;
      el.classList.toggle('pin--hidden', !visible);
      el.classList.toggle('pin--open', open);
      el.classList.toggle('pin--fav', fav);
      el.classList.toggle('pin--selected', f.selectedId === p.id);
      el.classList.toggle('pin--hot', golden);
      el.classList.toggle('pin--golden', golden);
      el.style.zIndex = f.selectedId === p.id ? '5' : p.major ? '2' : '1';
      this.priority.set(p.id, !visible ? -1 : (f.selectedId === p.id ? 100 : 0) + (fav ? 12 : 0) + (p.major ? 8 : 0) + (golden ? 6 : 0) + (open ? 3 : 0));
    }
    this.map.getContainer().classList.toggle('pins-night', f.night > 0.5);
    this.declutter();
  }
}

/** Pin for a selected map POI (they have no DOM pin of their own). */
export class SelectedPlaceMarker {
  private el = document.createElement('div');
  private marker: Marker;
  private id = '';
  constructor(map: MlMap) {
    this.el.className = 'pin pin--selected';
    this.el.innerHTML = `<span class="pin__inner"><span class="pin__bubble"></span><span class="pin__tail"></span></span>`;
    this.marker = new Marker({ element: this.el, anchor: 'bottom' }).setLngLat([0, 0]);
    this.map = map;
  }
  private map: MlMap;
  show(p: Place | null): void {
    if (!p) {
      if (this.id) this.marker.remove();
      this.id = '';
      return;
    }
    if (p.id === this.id) return;
    this.id = p.id;
    this.el.className = `pin pin--selected pin--${p.category}`;
    (this.el.querySelector('.pin__bubble') as HTMLElement).textContent = KIND_ICON[p.kind] ?? CATEGORY_ICON[p.category];
    this.marker.setLngLat(p.lngLat).addTo(this.map);
  }
}
