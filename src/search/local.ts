/**
 * Instant (local) search over what the app already has: featured places, piers, districts,
 * landmarks and the map POIs / street names in loaded tiles. Online OSM search (Nominatim) runs
 * only when the visitor submits — the Nominatim policy forbids search-as-you-type.
 */
export type ResultKind = 'place' | 'pier' | 'district' | 'landmark' | 'poi' | 'street' | 'osm';

export interface SearchResult {
  kind: ResultKind;
  /** Place / pier id, or "osm:way/123" for map features. */
  id: string;
  name: string;
  sub: string;
  icon: string;
  lngLat: [number, number];
  /** Optional [w, s, e, n] to fit instead of flying to a point. */
  bbox?: [number, number, number, number];
}

/** Case- and diacritic-insensitive key, Turkish-aware (İ→i, I→ı→i). */
export function norm(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 0 = no match; higher is better (prefix of a word beats substring; shorter names win ties). */
export function score(name: string, q: string): number {
  const n = norm(name);
  const k = norm(q);
  if (!k || !n.includes(k)) return 0;
  const base = n === k ? 100 : n.startsWith(k) ? 60 : n.split(' ').some((w) => w.startsWith(k)) ? 40 : 15;
  return base - Math.min(10, n.length / 10);
}

const KIND_RANK: Record<ResultKind, number> = { landmark: 6, district: 5, pier: 5, place: 4, poi: 2, street: 1, osm: 0 };

export function rankResults(items: SearchResult[], q: string, limit = 12): SearchResult[] {
  const seen = new Set<string>();
  return items
    .map((r) => ({ r, s: score(r.name, q) + KIND_RANK[r.kind] }))
    .filter((x) => x.s > KIND_RANK[x.r.kind])
    .sort((a, b) => b.s - a.s)
    .filter(({ r }) => {
      const key = `${norm(r.name)}|${r.kind === 'street' ? 'street' : r.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map((x) => x.r);
}
