/** Overpass JSON (`out geom`) shapes we rely on. */
export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; ref: number; role: string; geometry?: { lat: number; lon: number }[] }[];
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  osm3s?: { timestamp_osm_base?: string };
  elements: OverpassElement[];
}

export const RAW_OVERPASS = 'data/raw/overpass-istanbul.json';
export const RAW_NOMINATIM = 'data/raw/nominatim-istanbul.json';

/** Representative point: node position, else average of way/relation geometry. */
export function elementPoint(el: OverpassElement): [number, number] | null {
  if (el.lat !== undefined && el.lon !== undefined) return [el.lon, el.lat];
  if (el.center) return [el.center.lon, el.center.lat];
  const pts = el.geometry ?? el.members?.flatMap((m) => m.geometry ?? []) ?? [];
  if (!pts.length) return null;
  const lon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  return [lon, lat];
}

/** Case- and diacritic-insensitive comparison key, Turkish-aware (İ→i, I→ı→i). */
export function normName(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const osmRef = (el: OverpassElement) => `${el.type}/${el.id}`;
