/**
 * A landmark picked in search opens its place sheet (the same place a tap on the landmark opens):
 * the featured pin for the same OSM element when there is one (it carries hours / story), otherwise
 * an OSM place built from the landmark. No OSM element → null (the camera just flies there). Pure.
 */
import type { LandmarkProps } from '../data/load';
import type { Place } from '../places/types';

export type LandmarkOpen = { existing: string } | { add: Place } | null;

export function landmarkPlace(l: LandmarkProps, lngLat: [number, number], known: Iterable<Pick<Place, 'id' | 'osm' | 'source'>>): LandmarkOpen {
  if (!l.osm) return null;
  for (const p of known) if (p.osm === l.osm && p.source === 'featured') return { existing: p.id };
  const id = `osm:${l.osm}`;
  for (const p of known) if (p.id === id) return { existing: id };
  return { add: { id, name: l.name ?? '', nameEn: l.nameEn ?? null, category: 'culture', kind: 'attraction', osm: l.osm, district: null, hours: null, cuisine: null, lngLat, source: 'osm' } };
}
