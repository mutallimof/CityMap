/**
 * Event venues that aren't map places yet (runs inside the daily scraper, on GitHub's servers):
 *   1. Hand-listed venues (data/catalog/extra-venues.json): geocoded from their official address. The address
 *      is first checked against the venue's own contact page (street + number must appear there); a mismatch
 *      is logged with what the page says and the venue is left off the map until the catalog is fixed.
 *   2. Venue names from multi-venue programmes (e.g. Akbank Sanat's festival calendar): looked up by name in
 *      OpenStreetMap (Nominatim), accepted only when every word of the name matches a real POI.
 * Nominatim: bounded to our map, ≥ 1.1 s between requests, a clear User-Agent, results cached in
 * data/venue-geocode.json (misses retried after 30 days). Output: data/event-venues.geojson.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { CONFIG } from '../../src/config';
import { USER_AGENT, politeGet } from './http';
import { htmlToText, norm } from './parse';

const OUT = 'data/event-venues.geojson';
const CACHE = 'data/venue-geocode.json';
const RETRY_MS = 30 * 86_400_000;
const MAX_NAME_LOOKUPS = 40;

export interface ExtraVenue {
  id: string;
  name: string;
  kind: string;
  /** As written on the venue's own site. */
  address: string;
  /** The official page that states the address (checked before geocoding). */
  contact: string;
  /** Street words + number that must appear on the contact page, e.g. "Sadi Konuralp" + "5". */
  street: string;
  number: string;
  /** The same address spelled as OpenStreetMap spells it (e.g. "Ethem" for the venue's "Etham"), if different. */
  geocodeAs?: string;
}

export interface VenueProps {
  id: string;
  name: string;
  nameEn: null;
  category: 'culture' | 'food';
  kind: string;
  osm: string;
  address: string | null;
  district: null;
  hours: null;
  cuisine: null;
  website: string | null;
  phone: null;
  major: false;
  geocoded: 'address' | 'name';
}
type Feature = { type: 'Feature'; properties: VenueProps; geometry: { type: 'Point'; coordinates: [number, number] } };

interface Hit {
  osm_type: string;
  osm_id: number;
  category: string;
  type: string;
  addresstype?: string;
  name?: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
  address?: Record<string, string>;
  display_name?: string;
}

const POI_CLASSES = ['amenity', 'tourism', 'leisure', 'building', 'shop', 'office', 'club'];
const FOOD = ['bar', 'pub', 'nightclub', 'cafe', 'restaurant', 'biergarten'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastAt = 0;

async function nominatim(params: Record<string, string>): Promise<Hit[]> {
  const wait = lastAt + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastAt = Date.now();
  const [w, s, e, n] = CONFIG.bounds;
  const q = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', limit: '6', bounded: '1', viewbox: `${w},${n},${e},${s}`, countrycodes: 'tr', ...params });
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'tr' } });
    console.log(`  NOMINATIM ${res.status} ${params.q ?? JSON.stringify(params)}`);
    return res.ok ? ((await res.json()) as Hit[]) : [];
  } catch (e) {
    console.log(`  NOMINATIM failed: ${(e as Error).message}`);
    return [];
  }
}

const osmRef = (h: Hit) => `${h.osm_type}/${h.osm_id}`;
const metres = (h: Hit) => {
  const [s, n, w, e] = h.boundingbox.map(Number);
  return Math.hypot((n - s) * 111_000, (e - w) * 111_000 * Math.cos((s * Math.PI) / 180));
};
const slug = (s: string) => norm(s).replace(/ /g, '-').slice(0, 48);
const kindOf = (h: Hit) => (h.category === 'building' ? 'venue' : h.type === 'music_venue' || h.type === 'events_venue' || h.type === 'conference_centre' ? 'concert_hall' : h.type);

/** Does `hit` name every significant word of `want`? ("Nardis Jazz Club" ≈ "Nardis Jazz Bar" fails: club ≠ bar.) */
const STOP = new Set(['ve', 'and', 'the', 'istanbul', 'salonu', 'salon', 'sahnesi', 'sahne', 'merkezi', 'club', 'kulubu', 'sinifi', 'binasi']);
export function nameMatches(want: string, got: string): boolean {
  const g = new Set(norm(got).split(' '));
  const words = norm(want).split(' ').filter((t) => t.length >= 3 && !STOP.has(t));
  return words.length > 0 && words.every((t) => g.has(t) || [...g].some((x) => x.startsWith(t) && t.length >= 5));
}

/** Pieces of a programme's venue line worth looking up ("BAU - Pera / Sevinç Tevs Sınıfı" → whole, "BAU", …). */
export function nameCandidates(where: string): string[] {
  if (/çevrimiçi|online|zoom|youtube|instagram/i.test(where)) return [];
  const parts = where.split(/\s+[-–/|]\s+|,\s*/).map((p) => p.trim()).filter((p) => p.length >= 4);
  return [...new Set([where.trim(), ...parts])].slice(0, 3);
}

interface Cache {
  names: Record<string, { id: string | null; checked: string }>;
  addresses: Record<string, { address: string; verified: boolean | null; checked: string }>;
}

export class VenueGeo {
  private features = new Map<string, Feature>();
  private cache: Cache = { names: {}, addresses: {} };
  private lookups = 0;
  private known: Map<string, string>; // osm ref → existing place id
  log: string[] = [];

  constructor(existingOsm: Map<string, string>) {
    this.known = existingOsm;
    if (existsSync(OUT)) for (const f of (JSON.parse(readFileSync(OUT, 'utf8')) as { features: Feature[] }).features) this.features.set(f.properties.id, f);
    if (existsSync(CACHE)) this.cache = { ...this.cache, ...(JSON.parse(readFileSync(CACHE, 'utf8')) as Cache) };
  }

  /** All venues (for place matching): id → name. */
  places(): { id: string; name: string; osm: string }[] {
    return [...this.features.values()].map((f) => ({ id: f.properties.id, name: f.properties.name, osm: f.properties.osm }));
  }

  /** Hand-listed venues: verify the address on the official page, then geocode it (once; again if it changes). */
  async ensureExtra(list: ExtraVenue[]): Promise<void> {
    for (const v of list) {
      const have = this.features.get(v.id);
      const c = this.cache.addresses[v.id];
      if (have && c?.address === v.address && c.verified !== null) continue;
      let verified: boolean | null = null;
      try {
        const res = await politeGet(v.contact);
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        const page = norm(htmlToText(res.text));
        const ok = page.includes(norm(v.street)) && new RegExp(`\\b${v.number}\\b`).test(page.slice(Math.max(0, page.indexOf(norm(v.street)) - 60), page.indexOf(norm(v.street)) + 120));
        verified = ok;
        if (!ok) {
          const i = page.search(/\b(cad|caddesi|cd|sok|sokak|sk|mah|mahallesi)\b/);
          this.note(`${v.id}: address not found on ${v.contact} — page says: "${i >= 0 ? page.slice(Math.max(0, i - 80), i + 120) : '(no address-like text)'}"`);
          this.cache.addresses[v.id] = { address: v.address, verified, checked: new Date().toISOString() };
          continue;
        }
      } catch (e) {
        this.note(`${v.id}: contact page unreachable (${(e as Error).message}) — geocoding the catalog address unverified`);
      }
      const q = v.geocodeAs ?? v.address;
      let hits = await nominatim({ q });
      // no hit at all: the street alone (accepted below only if it's a short street)
      if (!hits.length) hits = await nominatim({ q: q.replace(/\s+(No:?\s*)?\d+[A-Za-z]?(\/\d+)?(?=,)/, '') });
      const num = (h: Hit) => (h.address?.house_number ?? '').replace(/\s/g, '').toLowerCase();
      const house = hits.find((h) => POI_CLASSES.includes(h.category) && (num(h) === v.number.toLowerCase() || num(h).startsWith(v.number)));
      const street = hits.find((h) => h.addresstype === 'road' && metres(h) < 350);
      const h = house ?? street;
      if (!h) {
        this.note(`${v.id}: "${v.address}" not geocoded precisely (${hits.map((x) => `${x.category}/${x.type}`).join(', ') || 'no results'})`);
        continue;
      }
      // the venue itself as an OSM POI (e.g. "AK Bank Sanat Galerisi")? then link it; a building/address isn't the venue
      const isVenue = !!h.name && nameMatches(v.name, h.name) && h.category !== 'building';
      this.put({ id: v.id, name: v.name, kind: v.kind, osm: isVenue ? osmRef(h) : '', address: v.address, website: new URL(v.contact).origin, geocoded: 'address' }, h);
      this.cache.addresses[v.id] = { address: v.address, verified, checked: new Date().toISOString() };
      this.note(`${v.id}: placed from ${house ? 'house number' : 'short street'} (${h.display_name ?? osmRef(h)})${verified ? ', address verified on the official page' : ''}`);
    }
  }

  /** A venue line from a programme → a map place id (existing or newly found in OSM), or null. */
  async resolve(where: string): Promise<string | null> {
    const key = norm(where);
    const c = this.cache.names[key];
    if (c && (c.id || Date.now() - Date.parse(c.checked) < RETRY_MS)) return c.id && (this.features.has(c.id) || [...this.known.values()].includes(c.id)) ? c.id : null;
    if (this.lookups >= MAX_NAME_LOOKUPS) return null;
    let found: string | null = null;
    for (const cand of nameCandidates(where)) {
      if (this.lookups++ >= MAX_NAME_LOOKUPS) break;
      const hit = (await nominatim({ q: `${cand}, İstanbul` })).find((h) => POI_CLASSES.includes(h.category) && h.category !== 'building' && !!h.name && nameMatches(cand, h.name));
      if (!hit) continue;
      const ref = osmRef(hit);
      found = this.known.get(ref) ?? [...this.features.values()].find((f) => f.properties.osm === ref)?.properties.id ?? null;
      if (!found) {
        found = `ev-${slug(hit.name!)}`;
        this.put({ id: found, name: hit.name!, kind: kindOf(hit), osm: ref, address: null, website: null, geocoded: 'name' }, hit);
        this.note(`"${where}" → ${hit.name} (${ref}, ${hit.category}/${hit.type})`);
      }
      break;
    }
    this.cache.names[key] = { id: found, checked: new Date().toISOString() };
    return found;
  }

  private put(p: Omit<VenueProps, 'nameEn' | 'category' | 'district' | 'hours' | 'cuisine' | 'phone' | 'major'>, h: Hit): void {
    const props: VenueProps = { nameEn: null, category: FOOD.includes(p.kind) ? 'food' : 'culture', district: null, hours: null, cuisine: null, phone: null, major: false, ...p };
    this.features.set(p.id, { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [Number(Number(h.lon).toFixed(6)), Number(Number(h.lat).toFixed(6))] } });
  }

  private note(s: string): void {
    this.log.push(s);
    console.log(`  venue: ${s}`);
  }

  save(): void {
    const features = [...this.features.values()].sort((a, b) => a.properties.id.localeCompare(b.properties.id));
    writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', features }, null, 1) + '\n');
    writeFileSync(CACHE, JSON.stringify(this.cache, null, 1) + '\n');
  }
}

