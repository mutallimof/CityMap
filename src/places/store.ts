import type { FeatureCollection, Point } from 'geojson';
import { CONFIG } from '../config';
import { sunTimes } from '../time/sun';
import { feedRank, isExpired, isLive, isNew, isSoon, isTonight, resolvePost } from './posts';
import type { Place, PlaceProps, Post, RawPost } from './types';
import type { Category } from '../ui/store';

export interface PlaceState {
  posts: Post[];
  newCount: number;
  live: boolean;
  soon: boolean;
  tonight: boolean;
  hasEvent: boolean;
}

const FAV_KEY = 'favourites';

/**
 * Places + DEMO posts, re-resolved against the simulated clock. Favourites live in localStorage
 * (device only). Listeners fire when posts are re-resolved or favourites change.
 */
export class PlacesStore {
  readonly places: Place[];
  readonly byId: Map<string, Place>;
  private raw: RawPost[];
  posts: Post[] = [];
  state = new Map<string, PlaceState>();
  favourites: Set<string>;
  private listeners = new Set<() => void>();
  private lastMs = 0;

  constructor(fc: FeatureCollection<Point, PlaceProps>, raw: RawPost[]) {
    this.places = fc.features.map((f) => ({ ...f.properties, lngLat: f.geometry.coordinates as [number, number] }));
    this.byId = new Map(this.places.map((p) => [p.id, p]));
    this.raw = raw.filter((p) => this.byId.has(p.placeId));
    this.favourites = new Set(readFavs());
  }

  /** Re-resolve posts for `nowMs` (cheap; called every few seconds of sim time). */
  update(nowMs: number, force = false): void {
    if (!force && Math.abs(nowMs - this.lastMs) < 20_000) return;
    this.lastMs = nowMs;
    const [lon, lat] = CONFIG.camera.center;
    const sun = sunTimes(nowMs, lat, lon);
    this.posts = this.raw.map((r) => resolvePost(r, nowMs, sun?.sunset ?? null)).filter((p) => !isExpired(p, nowMs));
    this.state = new Map();
    for (const p of this.places) this.state.set(p.id, { posts: [], newCount: 0, live: false, soon: false, tonight: false, hasEvent: false });
    for (const post of this.posts) {
      const s = this.state.get(post.placeId)!;
      s.posts.push(post);
      if (isNew(post, nowMs)) s.newCount++;
      if (isLive(post, nowMs)) s.live = true;
      if (isSoon(post, nowMs)) s.soon = true;
      if (isTonight(post, nowMs)) s.tonight = true;
      if (post.type === 'event') s.hasEvent = true;
    }
    for (const s of this.state.values()) s.posts.sort((a, b) => feedRank(b, nowMs) - feedRank(a, nowMs));
    this.emit();
  }

  /** Feed: posts passing the category / tonight / saved filters, best first. */
  feed(nowMs: number, f: { categories: Category[]; tonight: boolean; saved: boolean }): Post[] {
    return this.posts
      .filter((p) => this.matches(p, f, nowMs))
      .sort((a, b) => feedRank(b, nowMs) - feedRank(a, nowMs));
  }

  matches(p: Post, f: { categories: Category[]; tonight: boolean; saved: boolean }, nowMs: number): boolean {
    const place = this.byId.get(p.placeId)!;
    if (f.saved && !this.favourites.has(place.id)) return false;
    if (f.tonight && !isTonight(p, nowMs)) return false;
    if (!f.categories.length) return true;
    return f.categories.some((c) => (c === 'events' ? p.type === 'event' : place.category === c));
  }

  /** Whether a place's pin should show under the current filters. */
  placeVisible(id: string, f: { categories: Category[]; tonight: boolean }): boolean {
    const place = this.byId.get(id)!;
    const s = this.state.get(id);
    if (f.tonight && !s?.tonight) return false;
    if (!f.categories.length) return true;
    return f.categories.some((c) => (c === 'events' ? !!s?.hasEvent : place.category === c));
  }

  toggleFavourite(id: string): void {
    if (this.favourites.has(id)) this.favourites.delete(id);
    else this.favourites.add(id);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify([...this.favourites]));
    } catch {
      /* storage unavailable — favourites last for this session */
    }
    this.emit();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

function readFavs(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Great-circle distance in metres. */
export function distanceM(a: readonly [number, number], b: readonly [number, number]): number {
  const R = 6_371_000;
  const toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR;
  const dLon = (b[0] - a[0]) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
