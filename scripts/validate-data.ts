/**
 * Validates the refreshed data files before anything is committed or deployed (CI gate):
 *   data/events.json  — facts only, valid dates, https links (no ticket resellers), known places
 *   data/stories.json — OSM ref, name, position in our area, Wikipedia text + link, licensed photo
 * Also refuses a refresh that suddenly loses most of the data compared with the committed file
 * (a site redesign or an outage must not wipe the map). Exit code 1 on any problem.
 *
 * Run: npm run validate:data
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { CONFIG } from '../src/config';

export const CATEGORIES = ['concert', 'theatre', 'dance', 'exhibition', 'workshop', 'talk', 'festival', 'film', 'kids', 'other'] as const;
export const RESELLERS = /(^|\.)(biletix|passo|bubilet|biletinial|mobilet)\./i;

export interface EventItem {
  id: string;
  venue: string;
  place: string;
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  category: string;
  free?: boolean;
  price?: string;
  url: string;
  tickets?: string;
}

const problems: string[] = [];
const bad = (msg: string): void => void problems.push(msg);
const isHttps = (u: unknown) => typeof u === 'string' && /^https:\/\/[^\s]+$/.test(u);
const host = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
};

function committed<T>(file: string): T | null {
  try {
    return JSON.parse(execSync(`git show HEAD:${file}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 })) as T;
  } catch {
    return null;
  }
}

export function validateEvent(e: EventItem, places: Set<string>): string[] {
  const p: string[] = [];
  if (!e.id || !e.venue) p.push('missing id/venue');
  if (!places.has(e.place)) p.push(`unknown place "${e.place}"`);
  if (typeof e.title !== 'string' || !e.title.trim() || e.title.length > 200) p.push('bad title');
  if (Number.isNaN(Date.parse(e.start))) p.push(`bad start "${e.start}"`);
  if (e.end && (Number.isNaN(Date.parse(e.end)) || Date.parse(e.end) < Date.parse(e.start))) p.push(`bad end "${e.end}"`);
  if (!(CATEGORIES as readonly string[]).includes(e.category)) p.push(`bad category "${e.category}"`);
  if (!isHttps(e.url) || RESELLERS.test(host(e.url))) p.push(`bad url "${e.url}"`);
  if (e.tickets && (!isHttps(e.tickets) || RESELLERS.test(host(e.tickets)))) p.push(`bad tickets link "${e.tickets}"`);
  return p;
}

function checkEvents(places: Set<string>): void {
  const file = 'data/events.json';
  if (!existsSync(file)) return;
  const j = JSON.parse(readFileSync(file, 'utf8')) as { events: EventItem[] };
  if (!Array.isArray(j.events)) return bad(`${file}: no events array`);
  const ids = new Set<string>();
  for (const e of j.events) {
    for (const p of validateEvent(e, places)) bad(`${file} ${e.id ?? '?'}: ${p}`);
    if (ids.has(e.id)) bad(`${file}: duplicate id ${e.id}`);
    ids.add(e.id);
  }
  const prev = committed<{ events: unknown[] }>(file);
  const before = prev?.events?.length ?? 0;
  if (before >= 10 && j.events.length < before * 0.3) bad(`${file}: ${j.events.length} events vs ${before} committed — refusing a refresh that lost most data`);
  if (before > 0 && j.events.length === 0) bad(`${file}: empty`);
  console.log(`events: ${j.events.length} (committed ${before})`);
}

function checkStories(): void {
  const file = 'data/stories.json';
  if (!existsSync(file)) return;
  const j = JSON.parse(readFileSync(file, 'utf8')) as { stories: Record<string, Record<string, unknown>> };
  const [w, s, e, n] = CONFIG.bounds;
  const list = Object.values(j.stories ?? {});
  for (const st of list) {
    const id = String(st.osm);
    if (!/^(node|way|relation)\/\d+$/.test(id)) bad(`${file} ${id}: bad osm ref`);
    const name = st.name as { tr?: string; en?: string };
    if (!name?.tr && !name?.en) bad(`${file} ${id}: no name`);
    const [lon, lat] = st.lngLat as [number, number];
    if (!(lon > w && lon < e && lat > s && lat < n)) bad(`${file} ${id}: outside the map`);
    const sum = st.summary as { tr?: string | null; en?: string | null };
    const wiki = st.wiki as { tr?: string | null; en?: string | null };
    if (!sum?.tr && !sum?.en) bad(`${file} ${id}: no summary`);
    for (const l of ['tr', 'en'] as const) if (sum?.[l] && !(wiki?.[l] && /^https:\/\/(tr|en)\.wikipedia\.org\//.test(wiki[l]!))) bad(`${file} ${id}: ${l} summary without a Wikipedia link`);
    const ph = st.photo as Record<string, string> | null;
    if (ph && (!isHttps(ph.thumb) || !ph.license || !ph.artist || !isHttps(ph.page))) bad(`${file} ${id}: photo without credit/licence`);
  }
  const prev = committed<{ stories: Record<string, unknown> }>(file);
  const before = Object.keys(prev?.stories ?? {}).length;
  if (before >= 20 && list.length < before * 0.5) bad(`${file}: ${list.length} stories vs ${before} committed — refusing`);
  if (before > 0 && list.length === 0) bad(`${file}: empty`);
  console.log(`stories: ${list.length} (committed ${before})`);
}

if (process.argv[1]?.endsWith('validate-data.ts')) {
  const places = new Set(
    (JSON.parse(readFileSync('data/places.geojson', 'utf8')) as { features: { properties: { id: string } }[] }).features.map((f) => f.properties.id),
  );
  checkEvents(places);
  checkStories();
  if (problems.length) {
    console.error(`✗ ${problems.length} problem(s):\n  ` + problems.slice(0, 50).join('\n  '));
    process.exit(1);
  }
  console.log('✓ data valid');
}
