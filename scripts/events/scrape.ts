/**
 * Venue event scrapers (run daily in GitHub Actions — never from users' phones).
 *
 * Facts only: title, date/time, venue (→ map place), category, price if listed, the event page and
 * an official ticket link. No descriptions, no images. Polite: robots.txt respected, ≥ 4 s between
 * requests to a host, a clear User-Agent (see http.ts), each venue fetched at most once a day.
 * Ticket resellers are never fetched or linked.
 *
 * A venue that fails, is blocked, or suddenly yields nothing (layout change) keeps its last good
 * events; the outcome per venue goes to data/events-log.json (internal, not shown in the UI).
 *
 * Run: npm run data:events   (FORCE=1 ignores the once-a-day guard · VENUES=a,b limits venues)
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Blocked, politeGet, politePost } from './http';
import {
  absolute,
  clean,
  decode,
  findOccurrences,
  guessCategory,
  htmlToText,
  isFree,
  linksMatching,
  norm,
  pageTitle,
  parseDateList,
  priceIn,
  RESELLER,
  ticketLink,
  type Occurrence,
} from './parse';

const OUT = 'data/events.json';
const LOG = 'data/events-log.json';
const DAY_GUARD_MS = 20 * 3_600_000;
const HORIZON_DAYS = 120;
const MAX_PER_VENUE = 150;

interface Venue {
  id: string;
  name: string;
  site: string;
  scraper: 'arter' | 'akbank' | 'sehir' | 'generic';
  place?: string;
  placeFromText?: boolean;
  lists?: string[];
  links?: string;
  skip?: string;
  maxPages?: number;
}

export interface Ev {
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

interface VenueLog {
  status: 'ok' | 'failed' | 'blocked' | 'kept' | 'skipped';
  lastRun: string;
  lastOk?: string;
  count: number;
  unplaced?: number;
  message?: string;
}

const catalog = JSON.parse(readFileSync('data/catalog/venues.json', 'utf8')) as { aliases: [string, string][]; venues: Venue[] };
const placeIds = new Map<string, string>(); // normalized name → id
for (const file of ['data/places.geojson', 'data/venue-places.geojson']) {
  for (const f of (JSON.parse(readFileSync(file, 'utf8')) as { features: { properties: { id: string; name: string } }[] }).features) {
    const n = norm(f.properties.name);
    if (n.length >= 6) placeIds.set(n, f.properties.id);
  }
}
const known = new Set(placeIds.values());

/** Map place for a venue/stage text: aliases first, then any map place whose name appears in it. */
export function placeIn(text: string): string | null {
  const t = ` ${norm(text)} `;
  for (const [a, id] of catalog.aliases) if (t.includes(` ${a.trim()}`) && known.has(id)) return id;
  for (const [n, id] of placeIds) if (t.includes(` ${n} `)) return id;
  return null;
}

const now = new Date();
const inWindow = (o: Occurrence) => {
  const end = Date.parse(o.end ?? o.start) + (o.end ? 0 : 86_400_000);
  return end >= now.getTime() && Date.parse(o.start) <= now.getTime() + HORIZON_DAYS * 86_400_000;
};
const idFor = (venue: string, url: string, start: string) => `${venue}-${createHash('sha1').update(`${url}|${start}`).digest('hex').slice(0, 10)}`;

/** A timed session makes the same day's date-only mention redundant. */
function dedupe(occ: Occurrence[]): Occurrence[] {
  const timed = new Set(occ.filter((o) => !o.allDay).map((o) => o.start.slice(0, 10)));
  const seen = new Set<string>();
  return occ.filter((o) => {
    const k = `${o.start}|${o.end ?? ''}`;
    if (seen.has(k) || (o.allDay && !o.end && timed.has(o.start.slice(0, 10)))) return false;
    seen.add(k);
    return true;
  });
}

function make(v: Venue, place: string, title: string, o: Occurrence, url: string, extra: Partial<Ev> = {}): Ev {
  const e: Ev = { id: idFor(v.id, url, o.start), venue: v.id, place, title: title.slice(0, 180), start: o.start, category: 'other', url, ...extra };
  if (o.end) e.end = o.end;
  if (o.allDay) e.allDay = true;
  return e;
}

// ── Arter: the programme page's own JSON endpoint ────────────────────────────────────────────────
async function arter(v: Venue): Promise<Ev[]> {
  const out: Ev[] = [];
  for (const path of ['LoadEvents', 'LoadEvents_Future']) {
    const r = await politePost(`${v.site}/Index.aspx/${path}`, JSON.stringify({ dataCount: 60 }), 'application/json; charset=utf-8');
    if (r.status !== 200) throw new Error(`${path}: HTTP ${r.status}`);
    const d = (JSON.parse(r.text) as { d?: Record<string, unknown>[] }).d;
    if (!Array.isArray(d)) throw new Error(`${path}: no "d" array (layout changed?)`);
    for (const x of d) {
      const title = clean(String(x.EventHeaderTR ?? ''));
      const slug = String(x.EventHeaderURL ?? '');
      const sect = String(x.CategoryNameTR2 ?? '');
      if (!title || !slug || !sect || !x.EventID) continue;
      const url = `${v.site}/${encodeURI(sect)}/${encodeURI(slug)}/${x.EventID}`;
      const cat = String(x.CategoryNameTR ?? '') === 'Sergi' ? 'exhibition' : guessCategory(String(x.SubCategoryNameTR ?? ''), title);
      for (const o of parseDateList(String(x.EventDates ?? ''), now)) out.push(make(v, v.place!, title, o, url, { category: cat }));
    }
  }
  return out;
}

// ── Akbank Sanat: the weekly calendar page (one block per day, items with hour/category/title/venue) ─
async function akbank(v: Venue): Promise<{ events: Ev[]; unplaced: number }> {
  const r = await politeGet(v.lists![0]);
  if (r.status !== 200) throw new Error(`calendar: HTTP ${r.status}`);
  const events: Ev[] = [];
  let unplaced = 0;
  const weeks = [...r.text.matchAll(/class="week"[^>]*data-year="(\d{4})"([\s\S]*?)(?=class="week"|$)/g)];
  if (!weeks.length) throw new Error('calendar: no weeks (layout changed?)');
  for (const [, year, body] of weeks) {
    for (const day of body.matchAll(/data-day="(\d{1,2})\.(\d{1,2})"([\s\S]*?)(?=data-day="|$)/g)) {
      const [d, m] = [Number(day[1]), Number(day[2])];
      for (const item of day[3].matchAll(/data-category="([^"]*)"([\s\S]*?)class="btn ico arr"/g)) {
        const hour = /class="hour">\s*(\d{1,2})[:.](\d{2})/.exec(item[2]);
        const spans = [...item[2].matchAll(/<span>([\s\S]*?)<\/span>/g)].map((s) => clean(s[1]));
        const where = clean(/class="pl">([\s\S]*?)<\/p>/.exec(item[2])?.[1] ?? '');
        const href = [...item[2].matchAll(/href="([^"]+)"/g)].pop()?.[1];
        const title = spans[spans.length - 1];
        const url = href && absolute(href, v.site);
        if (!title || !url) continue;
        const place = placeIn(where);
        if (!place) {
          unplaced++;
          continue;
        }
        const pad = (n: number) => String(n).padStart(2, '0');
        // a December week can show January days
        const y = Number(year) + (m === 1 && body.includes('data-day="31.12"') ? 1 : 0);
        const start = `${y}-${pad(m)}-${pad(d)}T${hour ? `${pad(Number(hour[1]))}:${hour[2]}` : '00:00'}:00+03:00`;
        const o: Occurrence = hour ? { start } : { start, allDay: true };
        const cats = decode(item[1]);
        events.push(make(v, place, title, o, url, { category: /çocuk/i.test(cats) && !/atölye/i.test(cats) ? 'kids' : guessCategory(cats, title) }));
      }
    }
  }
  return { events, unplaced };
}

// ── Şehir Tiyatroları: play pages list each session with its stage ──────────────────────────────
async function sehir(v: Venue): Promise<{ events: Ev[]; unplaced: number }> {
  const home = await politeGet(v.lists![0]);
  if (home.status !== 200) throw new Error(`home: HTTP ${home.status}`);
  const plays = linksMatching(home.text, home.url, /^\/oyun\/[^/]+\/?$/, v.maxPages ?? 30);
  if (!plays.length) throw new Error('home: no /oyun/ links (layout changed?)');
  const events: Ev[] = [];
  let unplaced = 0;
  for (const url of plays) {
    const r = await politeGet(url);
    if (r.status !== 200) continue;
    const title = pageTitle(r.text).replace(/\s*[-|]\s*(İBB )?Şehir Tiyatroları.*$/i, '');
    for (const s of r.text.matchAll(/<time[^>]*>([\s\S]*?)<\/time>[\s\S]*?<address[^>]*>([\s\S]*?)<\/address>([\s\S]*?)(?=<time|$)/g)) {
      const occ = findOccurrences(clean(s[1]), now).filter((o) => !o.allDay);
      const stage = clean(s[2]);
      const place = placeIn(stage);
      if (!occ.length) continue;
      if (!place) {
        unplaced++;
        continue;
      }
      const seat = /href="(\/koltuk-secimi\/\d+)"/.exec(s[3])?.[1];
      for (const o of occ) {
        events.push(make(v, place, title, o, url, { category: guessCategory(title, 'tiyatro'), tickets: seat ? absolute(seat, v.site) ?? undefined : undefined }));
      }
    }
  }
  return { events, unplaced };
}

// ── Generic: list pages → same-site detail pages; facts from the text right under the <h1> ───────
async function generic(v: Venue): Promise<{ events: Ev[]; unplaced: number }> {
  const re = new RegExp(v.links!);
  const skip = v.skip ? new RegExp(v.skip) : null;
  const pages: string[] = [];
  let listed = 0;
  let lastErr: unknown = null;
  for (const list of v.lists ?? []) {
    try {
      const r = await politeGet(list);
      if (r.status !== 200) {
        lastErr = new Error(`${list}: HTTP ${r.status}`);
        continue;
      }
      listed++;
      for (const u of linksMatching(r.text, r.url, re, 60)) if (!skip?.test(new URL(u).pathname) && !pages.includes(u)) pages.push(u);
    } catch (e) {
      if (e instanceof Blocked) throw e;
      lastErr = e;
    }
  }
  if (!listed) throw lastErr ?? new Error('no list page loaded');
  const events: Ev[] = [];
  let unplaced = 0;
  for (const url of pages.slice(0, v.maxPages ?? 20)) {
    const r = await politeGet(url);
    if (r.status !== 200) continue;
    const at = r.text.search(/<h1[\s>]/i);
    if (at < 0) continue;
    const below = r.text.slice(at);
    const head = htmlToText(below).slice(0, 450);
    const title = pageTitle(r.text);
    const occ = dedupe(findOccurrences(head, now));
    if (!title || !occ.length) continue;
    const place = (v.placeFromText ? placeIn(head) : null) ?? v.place ?? null;
    if (!place) {
      unplaced++;
      continue;
    }
    const isRun = occ.some((o) => o.end);
    const extra: Partial<Ev> = { category: isRun && /sergi|exhibition/i.test(head) ? 'exhibition' : guessCategory(title, head.slice(0, 200)) };
    if (isFree(head)) extra.free = true;
    else if (priceIn(head)) extra.price = priceIn(head);
    const t = ticketLink(below.slice(0, 20_000), url);
    if (t) extra.tickets = t;
    for (const o of occ) events.push(make(v, place, title, o, url, extra));
  }
  return { events, unplaced };
}

async function scrape(v: Venue): Promise<{ events: Ev[]; unplaced: number }> {
  if (v.scraper === 'arter') return { events: await arter(v), unplaced: 0 };
  if (v.scraper === 'akbank') return akbank(v);
  if (v.scraper === 'sehir') return sehir(v);
  return generic(v);
}

/** Facts-only sanity per event; anything odd is dropped rather than shipped. */
function sane(e: Ev): boolean {
  const host = (u: string) => new URL(u).hostname;
  if (RESELLER.test(host(e.url)) || (e.tickets && RESELLER.test(host(e.tickets)))) return false;
  return !!e.title && e.title.length <= 180 && !Number.isNaN(Date.parse(e.start)) && inWindow(e);
}

async function main() {
  const prev: Ev[] = existsSync(OUT) ? ((JSON.parse(readFileSync(OUT, 'utf8')) as { events?: Ev[] }).events ?? []) : [];
  const prevLog: Record<string, VenueLog> = existsSync(LOG) ? ((JSON.parse(readFileSync(LOG, 'utf8')) as { venues?: Record<string, VenueLog> }).venues ?? {}) : {};
  const only = process.env.VENUES ? process.env.VENUES.split(',') : null;
  const force = !!process.env.FORCE;
  const log: Record<string, VenueLog> = { ...prevLog };
  const all: Ev[] = [];
  const stamp = now.toISOString();

  for (const v of catalog.venues) {
    const old = prev.filter((e) => e.venue === v.id && inWindow(e));
    const last = prevLog[v.id];
    const keep = (status: VenueLog['status'], message: string) => {
      all.push(...old);
      log[v.id] = { status, lastRun: status === 'skipped' ? last?.lastRun ?? stamp : stamp, lastOk: last?.lastOk, count: old.length, message };
      console.log(`✗ ${v.id}: ${status} — ${message}${old.length ? ` (kept ${old.length} earlier events)` : ''}`);
    };
    if ((only && !only.includes(v.id)) || (!force && last?.lastRun && now.getTime() - Date.parse(last.lastRun) < DAY_GUARD_MS)) {
      all.push(...old);
      if (last) log[v.id] = { ...last, count: old.length };
      continue;
    }
    console.log(`→ ${v.id} (${v.scraper})`);
    try {
      const { events, unplaced } = await scrape(v);
      const good = dedupeIds(events.filter(sane)).slice(0, MAX_PER_VENUE);
      if (!good.length && old.length) {
        keep('kept', `0 events now (layout change?)${unplaced ? `, ${unplaced} not on the map` : ''}`);
        continue;
      }
      all.push(...good);
      log[v.id] = { status: 'ok', lastRun: stamp, lastOk: stamp, count: good.length, ...(unplaced ? { unplaced } : {}) };
      console.log(`✓ ${v.id}: ${good.length} events${unplaced ? ` (${unplaced} at venues not on the map)` : ''}`);
    } catch (e) {
      keep(e instanceof Blocked ? 'blocked' : 'failed', e instanceof Error ? `${e.message}${e.cause ? ` (${String((e.cause as Error).message ?? e.cause)})` : ''}` : String(e));
    }
  }

  const events = dedupeIds(all).sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  writeFileSync(OUT, JSON.stringify({ generated: stamp, events }, null, 0) + '\n');
  writeFileSync(LOG, JSON.stringify({ generated: stamp, venues: log }, null, 1) + '\n');
  console.log(`→ ${OUT}: ${events.length} events from ${new Set(events.map((e) => e.venue)).size} venues`);
}

function dedupeIds(l: Ev[]): Ev[] {
  const seen = new Set<string>();
  return l.filter((e) => !seen.has(e.id) && (seen.add(e.id), true));
}

if (process.argv[1]?.endsWith('scrape.ts')) void main();
