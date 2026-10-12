import { CONFIG } from '../config';
import { nominatim } from '../osm/nominatim';
import { kindOfPlace } from '../places/icons';
import { categoryOfClass } from '../places/place-layers';
import type { SearchResult } from './local';

interface NomResult {
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
  lat: string;
  lon: string;
  name: string;
  display_name: string;
  category: string;
  type: string;
  boundingbox: [string, string, string, string];
}

export const PLACE_CATEGORIES = new Set(['amenity', 'shop', 'tourism', 'leisure', 'historic', 'craft']);

export type OsmResult = SearchResult & { _cat?: string; _type?: string };

/** The whole of OpenStreetMap (Nominatim, bounded to our area) — only on submit. `null` = search unreachable / failed;
 * `[]` = reached, nothing found. */
export async function osmSearch(q: string): Promise<OsmResult[] | null> {
  const [w, s, e, n] = CONFIG.bounds;
  const res = await nominatim<NomResult[]>('search', { q, viewbox: `${w},${n},${e},${s}`, bounded: '1', limit: '10', addressdetails: '0' });
  if (res === null) return null;
  // Long streets come back as several OSM ways — keep one per name.
  const seen = new Set<string>();
  const unique = res.filter((r) => {
    const k = r.category === 'highway' ? `hw|${r.name}` : `${r.osm_type}/${r.osm_id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return unique.map((r) => ({
    kind: 'osm' as const,
    id: `osm:${r.osm_type}/${r.osm_id}`,
    name: r.name || r.display_name.split(',')[0],
    sub: r.display_name.split(',').slice(1, 3).join(',').trim(),
    icon: PLACE_CATEGORIES.has(r.category) ? `k:${kindOfPlace(r.type, categoryOfClass(r.type) ?? '')}` : r.category === 'highway' ? '🛣' : r.category === 'place' || r.category === 'boundary' ? '🏘' : '📍',
    lngLat: [Number(r.lon), Number(r.lat)] as [number, number],
    bbox: [Number(r.boundingbox[2]), Number(r.boundingbox[0]), Number(r.boundingbox[3]), Number(r.boundingbox[1])] as [number, number, number, number],
    _cat: r.category,
    _type: r.type,
  }));
}
