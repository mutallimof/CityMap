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
  /** Top candidates disagree by > AMBIGUOUS_M, or a plausible candidate lies > FAR_M away. */
  ambiguous: boolean;
}

const AMBIGUOUS_M = 300;
/** Any plausible candidate this far from the winner means we may have picked the wrong place entirely. */
const FAR_M = 1000;
const NAME_KEYS = ['name', 'name:tr', 'name:en', 'official_name', 'alt_name', 'short_name'];

function names(el: OverpassElement): string[] {
  const t = el.tags ?? {};
  return NAME_KEYS.map((k) => t[k]).filter((v): v is string => !!v).map(normName);
}

function containsWord(hay: string, needle: string): boolean {
  return ` ${hay} `.includes(` ${needle} `);
}

function isFerryFeature(t: Record<string, string>): boolean {
  return (
    t.amenity === 'ferry_terminal' ||
    t.man_made === 'pier' ||
    (t.public_transport === 'station' && t.ferry === 'yes') ||
    normName(t.name ?? '').includes('iskele')
  );
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
/** Admin boundaries (Nominatim returns them with their admin-centre point): district (6) > mahalle (8). */
const ADMIN_RANK: Record<string, number> = { '6': 5, '8': 4 };

function resolve(cands: Match[], entry: CatalogEntry): MatchResult {
  if (entry.osm) {
    const pinned = cands.find((c) => osmRef(c.el) === entry.osm) ?? null;
    return { chosen: pinned, candidates: cands, ambiguous: false };
  }
  cands.sort((a, b) => b.score - a.score);
  const top = cands.filter((c) => c.score === cands[0]?.score);
  const dist = (c: Match) => (top[0] ? turf.distance(c.point, top[0].point, { units: 'meters' }) : 0);
  const ambiguous = top.some((c) => dist(c) > AMBIGUOUS_M) || cands.some((c) => c.score > 0 && dist(c) > FAR_M);
  return { chosen: cands[0] ?? null, candidates: cands, ambiguous };
}

/** Penalty for a berth named after *another* pier (e.g. Kadıköy's "Karaköy Eminönü İskelesi" berth). */
const OTHER_PIER_PENALTY = 4;

/**
 * `otherTokens`: match tokens of every other catalog pier. Terminals name berths after their
 * destination, so a name mentioning another pier is most likely a berth somewhere else.
 */
export function matchPier(entry: CatalogEntry, elements: OverpassElement[], otherTokens: string[] = []): MatchResult {
  const tokens = (entry.match ?? [entry.tr]).map(normName);
  const others = otherTokens.map(normName).filter((o) => !tokens.includes(o));
  const cands: Match[] = [];
  for (const el of elements) {
    const t = el.tags ?? {};
    if (!isFerryFeature(t)) continue;
    const ns = names(el);
    if (!ns.some((n) => tokens.some((tok) => containsWord(n, tok)))) continue;
    const point = elementPoint(el);
    const mentionsOther = ns.some((nm) => others.some((o) => containsWord(nm, o)));
    if (point) cands.push({ el, point, score: pierScore(t) - (mentionsOther ? OTHER_PIER_PENALTY : 0) });
  }
  return resolve(cands, entry);
}

export function matchDistrict(entry: CatalogEntry, elements: OverpassElement[]): MatchResult {
  const tokens = (entry.match ?? [entry.tr]).map(normName);
  const cands: Match[] = [];
  for (const el of elements) {
    const t = el.tags ?? {};
    const score = t.place ? (PLACE_RANK[t.place] ?? 0) : t.boundary === 'administrative' ? (ADMIN_RANK[t.admin_level] ?? 1) : null;
    if (score === null) continue;
    if (!names(el).some((n) => tokens.includes(n.replace(/ mahallesi$/, '')))) continue;
    const point = elementPoint(el);
    if (point) cands.push({ el, point, score });
  }
  return resolve(cands, entry);
}
