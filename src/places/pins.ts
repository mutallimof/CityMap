import { Marker, type Map as MlMap } from 'maplibre-gl';
import { CONFIG } from '../config';
import type { PlacesStore } from './store';
import type { Place } from './types';

export const CATEGORY_ICON: Record<string, string> = {
  food: '🍽',
  culture: '🎭',
  shopping: '🛍',
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
};

export interface PinFilters {
  categories: string[];
  tonight: boolean;
  selectedId: string | null;
  golden: number;
  night: number;
}

/**
 * Snapchat-style place pins (DOM markers): a round bubble with the category icon, a gradient
 * "story ring" + glow when the place has fresh posts, a pulse when something is on now, a heart
 * for favourites, sunset spots that glow during golden hour. Visibility follows zoom + filters.
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
      el.className = `pin pin--${p.category}`;
      el.type = 'button';
      el.setAttribute('aria-label', p.name);
      el.innerHTML = `<span class="pin__inner"><span class="pin__ring"></span><span class="pin__bubble">${KIND_ICON[p.kind] ?? CATEGORY_ICON[p.category]}</span><span class="pin__count"></span><span class="pin__fav">♥</span><span class="pin__tail"></span><span class="pin__label"></span></span>`;
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

  /** Refresh classes from post state + filters (cheap; a few dozen elements). */
  update(f: PinFilters): void {
    for (const p of this.store.places) {
      const el = this.els.get(p.id)!;
      const s = this.store.state.get(p.id);
      const visible = this.store.placeVisible(p.id, { categories: f.categories as never, tonight: f.tonight });
      const fresh = (s?.newCount ?? 0) > 0;
      el.classList.toggle('pin--hidden', !visible);
      el.classList.toggle('pin--new', fresh);
      el.classList.toggle('pin--live', !!s?.live);
      el.classList.toggle('pin--soon', !!s?.soon && !s?.live);
      el.classList.toggle('pin--tonight', f.tonight && !!s?.tonight);
      el.classList.toggle('pin--fav', this.store.favourites.has(p.id));
      el.classList.toggle('pin--selected', f.selectedId === p.id);
      el.classList.toggle('pin--hot', fresh || !!s?.live || (p.category === 'view' && f.golden > 0.35));
      el.classList.toggle('pin--golden', p.category === 'view' && f.golden > 0.35);
      const count = el.querySelector('.pin__count') as HTMLElement;
      count.textContent = (s?.newCount ?? 0) >= 2 ? String(s!.newCount) : '';
      el.classList.toggle('pin--count', (s?.newCount ?? 0) >= 2);
      el.style.zIndex = f.selectedId === p.id ? '5' : s?.live ? '3' : fresh ? '2' : '1';
      const fav = this.store.favourites.has(p.id);
      this.priority.set(
        p.id,
        !visible ? -1 : (f.selectedId === p.id ? 100 : 0) + (s?.live ? 20 : 0) + (fav ? 12 : 0) + (s?.soon ? 8 : 0) + (fresh ? 6 : 0) + (p.category === 'view' ? 3 : 0) + (s?.posts.length ?? 0),
      );
    }
    this.map.getContainer().classList.toggle('pins-night', f.night > 0.5);
    this.declutter();
  }
}
