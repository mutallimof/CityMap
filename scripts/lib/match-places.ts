import * as turf from '@turf/turf';
import { elementPoint, normName, osmRef, type OverpassElement } from './overpass';

export interface CatalogEntry {
  id: string;
  tr: string;
  en: string;
  match?: string[];
  /** Pin a specific OSM feature, e.g. "node/123". */
  osm?: string;
}

export interface Match {
  el: OverpassElement;
  point: [number, number];
  score: number;
}

export interface MatchResult {
  chosen: Match | null;
  candidates: Match[];
  /** Top candidates disagree by more than AMBIGUOUS_M metres. */
  ambiguous: boolean;
}

const AMBIGUOUS_M = 300;
const NAME_KEYS = ['name', 'name:tr', 'name:en', 'official_name', 'alt_name', 'short_name'];

function names(el: OverpassElement): string[] {
  const t = el.tags ?? {};
  return NAME_KEYS.map((k) => t[k]).filter((v): v is string => !!v).map(normName);
}

function containsWord(hay: string, needle: string): boolean {
  return ` ${hay} `.includes(` ${needle} `);
}

function isFerryFeature(t: Record<string, string>): boolean {
  return t.amenity === 'ferry_terminal' || t.man_made === 'pier' || (t.public_transport === 'station' && t.ferry === 'yes');
}

function pierScore(t: Record<string, string>): number {
  let s = 0;
  if (t.amenity === 'ferry_terminal') s += 3;
  if (t.public_transport === 'station') s += 2;
  if (t.man_made === 'pier') s += 1;
  const op = normName(`${t.operator ?? ''} ${t.name ?? ''} ${t.network ?? ''}`);
  if (op.includes('sehir hatlari')) s += 2;
  return s;
}

const PLACE_RANK: Record<string, number> = { suburb: 6, town: 5, quarter: 4, neighbourhood: 3, island: 3, village: 2, city: 1 };

function resolve(cands: Match[], entry: CatalogEntry): MatchResult {
  if (entry.osm) {
    const pinned = cands.find((c) => osmRef(c.el) === entry.osm) ?? null;
    return { chosen: pinned, candidates: cands, ambiguous: false };
  }
  cands.sort((a, b) => b.score - a.score);
  const top = cands.filter((c) => c.score === cands[0]?.score);
  const ambiguous = top.some((c) => turf.distance(c.point, top[0].point, { units: 'meters' }) > AMBIGUOUS_M);
  return { chosen: cands[0] ?? null, candidates: cands, ambiguous };
}

export function matchPier(entry: CatalogEntry, elements: OverpassElement[]): MatchResult {
  const tokens = (entry.match ?? [entry.tr]).map(normName);
  const cands: Match[] = [];
  for (const el of elements) {
    const t = el.tags ?? {};
    if (!isFerryFeature(t)) continue;
    const ns = names(el);
    if (!ns.some((n) => tokens.some((tok) => containsWord(n, tok)))) continue;
    const point = elementPoint(el);
    if (point) cands.push({ el, point, score: pierScore(t) });
  }
  return resolve(cands, entry);
}

export function matchDistrict(entry: CatalogEntry, elements: OverpassElement[]): MatchResult {
  const tokens = (entry.match ?? [entry.tr]).map(normName);
  const cands: Match[] = [];
  for (const el of elements) {
    const place = el.tags?.place;
    if (!place) continue;
    if (!names(el).some((n) => tokens.includes(n))) continue;
    const point = elementPoint(el);
    if (point) cands.push({ el, point, score: PLACE_RANK[place] ?? 0 });
  }
  return resolve(cands, entry);
}
