import type { FeatureCollection, Point } from 'geojson';
import { toIstanbul } from '../sim/time';
import { lookupId, nominatim } from '../osm/nominatim';
import { openStatus, type OpenStatus } from './opening-hours';
import type { Place, PlaceCategory, PlaceDetails, PlaceProps } from './types';
import type { Category } from '../ui/store';

const FAV_KEY = 'favourites';

export interface PlaceFilters {
  categories: Category[];
  openNow: boolean;
}

/** Map chip → place categories it shows ("Parks" also shows viewpoints). */
const CHIP: Record<Category, PlaceCategory[]> = { food: ['food'], culture: ['culture'], shopping: ['shopping'], park: ['park', 'view'] };

export function matchesCategory(cat: PlaceCategory, chips: Category[]): boolean {
  return !chips.length || chips.some((c) => CHIP[c].includes(cat));
}

/** Open / closed at a simulated moment from the OSM opening_hours string. */
export function openAt(hours: string | null | undefined, nowMs: number): OpenStatus {
  const local = toIstanbul(nowMs);
  const weekday = (new Date(local.day * 86_400_000).getUTCDay() + 6) % 7; // 0 = Monday
  return openStatus(hours ?? undefined, weekday, Math.floor(local.seconds / 60));
}

interface NomLookup {
  extratags?: Record<string, string> | null;
  namedetails?: Record<string, string> | null;
  address?: Record<string, string>;
}

/**
 * Places — all real OpenStreetMap data: the featured set (data/places.geojson) plus any map POI the
 * visitor taps (added on the fly). Extra tags (hours, website, phone) are looked up from Nominatim
 * when a place is opened. Favourites live in localStorage (device only).
 */
export class PlacesStore {
  readonly places: Place[];
  readonly byId: Map<string, Place>;
  readonly details = new Map<string, 'loading' | 'done' | 'failed'>();
  favourites: Set<string>;
  private listeners = new Set<() => void>();

  constructor(fc: FeatureCollection<Point, PlaceProps>) {
    this.places = fc.features.map((f) => ({ ...f.properties, lngLat: f.geometry.coordinates as [number, number], source: 'featured' as const }));
    this.byId = new Map(this.places.map((p) => [p.id, p]));
    this.favourites = new Set(readFavs());
  }

  /** Add a place found on the map (a tapped POI); returns the stored one. */
  add(p: Place): Place {
    const existing = this.byId.get(p.id);
    if (existing) return existing;
    this.byId.set(p.id, p);
    return p;
  }

  open(id: string, nowMs: number): OpenStatus {
    return openAt(this.byId.get(id)?.hours, nowMs);
  }

  visible(id: string, f: PlaceFilters, nowMs: number): boolean {
    const p = this.byId.get(id);
    if (!p || !matchesCategory(p.category, f.categories)) return false;
    return !f.openNow || this.open(id, nowMs).state === 'open';
  }

  /** Fetch hours / website / phone from OSM (Nominatim lookup) and merge what is missing. */
  async loadDetails(id: string): Promise<void> {
    const p = this.byId.get(id);
    const lid = p && lookupId(p.osm);
    if (!p || !lid || this.details.has(id)) return;
    this.details.set(id, 'loading');
    this.emit();
    const r = await nominatim<NomLookup[]>('lookup', { osm_ids: lid, extratags: '1', namedetails: '1', addressdetails: '1' });
    const hit = r?.[0];
    if (!hit) {
      this.details.set(id, 'failed');
      this.emit();
      return;
    }
    const d = detailsFrom(hit);
    p.hours ??= d.hours;
    p.website ??= d.website;
    p.phone ??= d.phone;
    p.cuisine ??= d.cuisine;
    p.district ??= d.district;
    p.nameEn ??= d.nameEn;
    this.details.set(id, 'done');
    this.emit();
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

  emit(): void {
    for (const fn of this.listeners) fn();
  }
}

export function detailsFrom(r: NomLookup): PlaceDetails {
  const t = r.extratags ?? {};
  const a = r.address ?? {};
  const url = t.website ?? t['contact:website'] ?? t.url ?? null;
  return {
    hours: t.opening_hours ?? null,
    website: url && /^https?:\/\//i.test(url) ? url : url ? `https://${url}` : null,
    phone: t.phone ?? t['contact:phone'] ?? t['contact:mobile'] ?? null,
    cuisine: t.cuisine ?? null,
    district: a.suburb ?? a.city_district ?? a.quarter ?? a.town ?? null,
    nameEn: r.namedetails?.['name:en'] ?? null,
  };
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
