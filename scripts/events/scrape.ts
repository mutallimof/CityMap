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
import { VenueGeo, type ExtraVenue } from './venues-geo';
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
  isoFromUnix,
  parseDateList,
  priceIn,
  titleCase,
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
  scraper: 'arter' | 'akbank' | 'sehir' | 'salon' | 'fisekhane' | 'dasdas' | 'kumbaraci' | 'listtext' | 'uniq' | 'bkm' | 'generic';
  place?: string;
  placeFromText?: boolean;
  lists?: string[];
  links?: string;
  skip?: string;
  maxPages?: number;
  /** listtext: item titles to ignore (navigation that sits before a date). */
  dropTitles?: string;
  /** Why this venue isn't scraped right now (kept in the config so it's easy to turn back on). */
  disabled?: string;
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
  status: 'ok' | 'empty' | 'failed' | 'blocked' | 'kept' | 'skipped';
  lastRun: string;
  lastOk?: string;
  count: number;
  unplaced?: number;
  message?: string;
}

const catalog = JSON.parse(readFileSync('data/catalog/venues.json', 'utf8')) as { aliases: [string, string][]; venues: Venue[] };
const placeIds = new Map<string, string>(); // normalized name → id
const known = new Set<string>();
const byOsm = new Map<string, string>(); // osm ref → place id
function addPlace(id: string, name: string, osm?: string): void {
  const n = norm(name);
  if (n.length >= 6) placeIds.set(n, id);
  known.add(id);
  if (osm) byOsm.set(osm, id);
}
for (const file of ['data/places.geojson', 'data/venue-places.geojson']) {
  for (const f of (JSON.parse(readFileSync(file, 'utf8')) as { features: { properties: { id: string; name: string; osm: string } }[] }).features) {
    addPlace(f.properties.id, f.properties.name, f.properties.osm);
  }
}
const geo = new VenueGeo(byOsm);
for (const p of geo.places()) addPlace(p.id, p.name);
const extraVenues = (JSON.parse(readFileSync('data/catalog/extra-venues.json', 'utf8')) as { venues: ExtraVenue[] }).venues;

/** Place for a programme's venue line: known places first, then a lookup in OpenStreetMap by name. */
async function placeOrFind(where: string, unplaced: Set<string>): Promise<string | null> {
  const p = placeIn(where);
  if (p || !where) return p;
  const found = await geo.resolve(where);
  if (found) {
    const f = geo.places().find((x) => x.id === found);
    if (f) addPlace(f.id, f.name);
    return found;
  }
  unplaced.add(where);
  return null;
}

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
const idFor = (venue: string, url: string, start: string, title: string) => `${venue}-${createHash('sha1').update(`${url}|${start}|${title}`).digest('hex').slice(0, 10)}`;

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
  const e: Ev = { id: idFor(v.id, url, o.start, title), venue: v.id, place, title: title.slice(0, 180), start: o.start, category: 'other', url, ...extra };
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
async function akbank(v: Venue): Promise<{ events: Ev[]; unplaced: number; note?: string }> {
  const r = await politeGet(v.lists![0]);
  if (r.status !== 200) throw new Error(`calendar: HTTP ${r.status}`);
  const events: Ev[] = [];
  let unplaced = 0;
  const names = new Set<string>();
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
        const pad = (n: number) => String(n).padStart(2, '0');
        // a December week can show January days
        const y = Number(year) + (m === 1 && body.includes('data-day="31.12"') ? 1 : 0);
        const start = `${y}-${pad(m)}-${pad(d)}T${hour ? `${pad(Number(hour[1]))}:${hour[2]}` : '00:00'}:00+03:00`;
        const o: Occurrence = hour ? { start } : { start, allDay: true };
        if (!inWindow(o)) continue;
        const place = await placeOrFind(where, names);
        if (!place) {
          unplaced++;
          continue;
        }
        const cats = decode(item[1]);
        events.push(make(v, place, title, o, url, { category: /çocuk/i.test(cats) && !/atölye/i.test(cats) ? 'kids' : guessCategory(cats, title) }));
      }
    }
  }
  return { events, unplaced, note: names.size ? `not on the map: ${[...names].join(' · ')}` : undefined };
}

// ── Şehir Tiyatroları: play pages list each session with its stage ──────────────────────────────
async function sehir(v: Venue): Promise<{ events: Ev[]; unplaced: number; note?: string }> {
  const home = await politeGet(v.lists![0]);
  if (home.status !== 200) throw new Error(`home: HTTP ${home.status}`);
  const plays = linksMatching(home.text, home.url, /^\/oyun\/[^/]+\/?$/, v.maxPages ?? 30);
  if (!plays.length) throw new Error('home: no /oyun/ links (layout changed?)');
  const events: Ev[] = [];
  let unplaced = 0;
  const names = new Set<string>();
  for (const url of plays) {
    const r = await politeGet(url);
    if (r.status !== 200) continue;
    const title = pageTitle(r.text).replace(/\s*[-|]\s*(İBB )?Şehir Tiyatroları.*$/i, '');
    for (const s of r.text.matchAll(/<time[^>]*>([\s\S]*?)<\/time>[\s\S]*?<address[^>]*>([\s\S]*?)<\/address>([\s\S]*?)(?=<time|$)/g)) {
      const occ = findOccurrences(clean(s[1]), now).filter((o) => !o.allDay && inWindow(o));
      const stage = clean(s[2]);
      if (!occ.length) continue;
      const place = await placeOrFind(stage, names);
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
  return { events, unplaced, note: names.size ? `not on the map: ${[...names].join(' · ')}` : undefined };
}

// ── Generic: list pages → same-site detail pages; facts from the text right under the <h1> ───────
async function generic(v: Venue): Promise<{ events: Ev[]; unplaced: number; note: string }> {
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
  let undated = 0;
  for (const url of pages.slice(0, v.maxPages ?? 20)) {
    const r = await politeGet(url);
    if (r.status !== 200) continue;
    const at = r.text.search(/<h1[\s>]/i);
    if (at < 0) continue;
    const below = r.text.slice(at);
    const head = htmlToText(below).slice(0, 450);
    const title = pageTitle(r.text);
    const occ = dedupe(findOccurrences(head, now));
    if (!title || !occ.length) {
      undated++;
      continue;
    }
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
  return { events, unplaced, note: `${listed} list page(s), ${pages.length} detail link(s), ${undated} without a date` };
}


type Result = { events: Ev[]; unplaced: number; note?: string };
const pad2 = (n: number | string) => String(n).padStart(2, '0');
/** Category for a stage's programme: from the title when it says (concert, workshop…), else a play. */
const stageCategory = (title: string, hint = '') => {
  const c = guessCategory(title, hint);
  return c === 'other' ? 'theatre' : c;
};

// ── Salon İKSV: the programme page's own JSON endpoint (date, time, page per event) ──────────────
async function salon(v: Venue): Promise<Result> {
  const events: Ev[] = [];
  for (let page = 0, pages = 1; page < pages && page < 5; page++) {
    const body = `plugin=events&programSalon=4582&itemCount=70&currentPage=${page}&lang=tr&getall=false&getnew=true`;
    const r = await politePost(`${v.site}/plugins/iksv/plugins.ashx`, body, 'application/x-www-form-urlencoded; charset=UTF-8');
    if (r.status !== 200) throw new Error(`programme: HTTP ${r.status}`);
    const j = JSON.parse(r.text) as { data?: Record<string, unknown>[]; pageCount?: number };
    if (!Array.isArray(j.data)) throw new Error('programme: no "data" array (layout changed?)');
    pages = Number(j.pageCount ?? 1);
    for (const x of j.data) {
      const title = clean(String(x.headline ?? '')).replace(/^TARİH DEĞİŞİKLİĞİ:\s*/i, '');
      const occ = findOccurrences(`${x.date ?? ''} ${x.time ?? ''}`, now);
      const url = x.alias ? absolute(`https://${String(x.alias).replace(/^https?:\/\//, '')}`, v.site) : null;
      if (!title || !occ.length || !url) continue;
      const section = String(x.section ?? '').replace(/:[0-9a-f]{3,6}/gi, '');
      for (const o of occ) events.push(make(v, v.place!, title, o, url, { category: guessCategory(section, title) }));
    }
  }
  return { events, unplaced: 0 };
}

// ── Fişekhane: the programme lists every session with its start as a unix time in the link ──────
async function fisekhane(v: Venue): Promise<Result> {
  const r = await politeGet(v.lists![0]);
  if (r.status !== 200) throw new Error(`programme: HTTP ${r.status}`);
  const events: Ev[] = [];
  const re = /href="(\/tr\/etkinlik\/[^"/]+\/(\d{9,10})\.html)"[\s\S]{0,900}?<p class="font-bold[^"]*"[^>]*>([^<]+)<\/p>\s*<p class="font-14[^"]*">([^<]*)<\/p>/g;
  for (const m of r.text.matchAll(re)) {
    const url = absolute(m[1], r.url);
    if (!url) continue;
    events.push(make(v, v.place!, titleCase(decode(m[3])), { start: isoFromUnix(Number(m[2])) }, url, { category: stageCategory(m[3], decode(m[4])) }));
  }
  if (!events.length && !/\/tr\/etkinlik\//.test(r.text)) throw new Error('programme: no event links (layout changed?)');
  return { events, unplaced: 0 };
}

// ── DasDas: programme cards ("10 Ekim 2026, 20:00" + link + title) for the Ataşehir stage ────────
async function dasdas(v: Venue): Promise<Result> {
  const r = await politeGet(v.lists![0]);
  if (r.status !== 200) throw new Error(`programme: HTTP ${r.status}`);
  const events: Ev[] = [];
  const re = />(\d{1,2} [^\s<]+ \d{4}, \d{1,2}:\d{2})<\/span>[\s\S]{0,600}?aria-label="([^"]+?) etkinlik detayına git"[^>]*href="(\/event\/[^"]+)"/g;
  for (const m of r.text.matchAll(re)) {
    const url = absolute(m[3], r.url);
    const occ = findOccurrences(m[1], now);
    if (!url || !occ.length) continue;
    events.push(make(v, v.place!, decode(m[2]), occ[0], url, { category: stageCategory(decode(m[2])) }));
  }
  return { events, unplaced: 0 };
}

// ── Kumbaracı50: monthly calendar grid (day → play, company/stage, time) ─────────────────────────
async function kumbaraci(v: Venue): Promise<Result> {
  const events: Ev[] = [];
  let unplaced = 0;
  const names = new Set<string>();
  for (const list of v.lists!) {
    const r = await politeGet(list);
    if (r.status !== 200) continue;
    const head = new RegExp(`(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\\s+(\\d{4})`).exec(htmlToText(r.text));
    if (!head) throw new Error('calendar: no month heading (layout changed?)');
    const month = findOccurrences(`1 ${head[1]} ${head[2]}`, now)[0].start.slice(0, 8); // "2026-10-"
    let started = false;
    for (const box of r.text.matchAll(/<div class="day-number">(\d{1,2})<\/div>([\s\S]*?)(?=<div class="day-number">|$)/g)) {
      const day = Number(box[1]);
      if (day === 1) {
        if (started) break; // next month's days at the end of the grid
        started = true;
      }
      if (!started) continue;
      for (const li of box[2].matchAll(/<a href="([^"]+)">([\s\S]*?)<\/a>/g)) {
        const name = clean(/class="name[^"]*">([\s\S]*?)<\/p>/.exec(li[2])?.[1] ?? '');
        const lines = [...li[2].matchAll(/class="time"\s*>([\s\S]*?)<\/p>/g)].map((t) => clean(t[1]));
        const time = lines.map((t) => /^(\d{1,2})[.:](\d{2})$/.exec(t)).find(Boolean);
        const url = absolute(li[1], r.url);
        if (!name || !url || !time) continue;
        // other lines are the company ("Tiyatro Ruf") or another stage ("Apartman Sahne", "… Tiyatrosu")
        const stage = lines.find((t) => !/^\d/.test(t) && !/kumbarac[ıi] ?50/i.test(t) && /(sahne|sahnesi|tiyatrosu|salonu|merkezi)$/i.test(t));
        const place = stage ? await placeOrFind(stage, names) : v.place!;
        if (!place) {
          unplaced++;
          continue;
        }
        const o = { start: `${month}${pad2(day)}T${pad2(time[1])}:${time[2]}:00+03:00` };
        events.push(make(v, place, name, o, url, { category: stageCategory(name) }));
      }
    }
  }
  return { events, unplaced, note: names.size ? `not on the map: ${[...names].join(' · ')}` : undefined };
}

// ── List pages that print "title | date [| time] | category" items (exhibitions, talks, workshops) ─
const LABEL = /^(sergi|etkinlik|konuşma|söyleşi|performans|atölye|konser|gösterim|web performans|detaylar|devamı|○|&#9675;|-)$/i;
export function listItems(text: string, base: string): { title: string; occ: Occurrence[]; hint: string }[] {
  const segs = text.split(' | ').map((x) => x.trim());
  const out: { title: string; occ: Occurrence[]; hint: string }[] = [];
  for (let i = 1; i < segs.length; i++) {
    let occ = findOccurrences(segs[i], now);
    if (!occ.length || segs[i].length > 60) continue;
    const tm = segs.slice(i + 1, i + 3).map((x) => /^(\d{1,2})[:.](\d{2})/.exec(x)).find(Boolean);
    if (tm && occ.length === 1 && occ[0].allDay && !occ[0].end) occ = [{ start: `${occ[0].start.slice(0, 11)}${pad2(tm[1])}:${tm[2]}:00+03:00` }];
    let j = i - 1;
    const labels: string[] = [];
    while (j > 0 && (LABEL.test(segs[j]) || !/\p{L}{2}/u.test(segs[j]))) labels.push(segs[j--]);
    const title = segs[j];
    if (!title || findOccurrences(title, now).length || title.length > 140) continue;
    out.push({ title, occ, hint: [...labels, ...segs.slice(i + 1, i + 4), base].join(' ') });
  }
  return out;
}
async function listtext(v: Venue): Promise<Result> {
  const events: Ev[] = [];
  let loaded = 0;
  for (const list of v.lists!) {
    const r = await politeGet(list);
    if (r.status !== 200) continue;
    loaded++;
    const drop = v.dropTitles ? new RegExp(v.dropTitles, 'i') : null;
    for (const it of listItems(htmlToText(r.text), list)) {
      if (drop?.test(it.title)) continue;
      const run = it.occ.some((o) => o.end);
      const category = run && /sergi|exhibition/i.test(it.hint) ? 'exhibition' : guessCategory(it.title, it.hint);
      for (const o of it.occ) events.push(make(v, v.place!, it.title, o, list, { category }));
    }
  }
  if (!loaded) throw new Error('no list page loaded');
  return { events, unplaced: 0 };
}

// ── UNIQ İstanbul: programme cards (title + date in the link); the event page adds time + hall ────
async function uniq(v: Venue): Promise<Result> {
  const r = await politeGet(v.lists![0]);
  if (r.status !== 200) throw new Error(`programme: HTTP ${r.status}`);
  const items = new Map<string, { title: string; date: string }>();
  for (const m of r.text.matchAll(/<h3><a href="([^"]+event_date=(\d{4}-\d{2}-\d{2}))">([\s\S]*?)<\/a><\/h3>/g)) items.set(decode(m[1]), { title: clean(m[3]), date: m[2] });
  if (!items.size) throw new Error('programme: no event cards (layout changed?)');
  const events: Ev[] = [];
  let details = 0;
  for (const [href, it] of items) {
    const url = absolute(href, r.url);
    if (!url || !it.title) continue;
    let o: Occurrence = { start: `${it.date}T00:00:00+03:00`, allDay: true };
    if (!inWindow(o)) continue;
    if (details++ < (v.maxPages ?? 25)) {
      const d = await politeGet(url);
      const t = /fa-clock-o"><\/i>\s*(\d{1,2}):(\d{2})/.exec(d.text);
      if (t) o = { start: `${it.date}T${pad2(t[1])}:${t[2]}:00+03:00` };
    }
    events.push(make(v, v.place!, it.title, o, url, { category: guessCategory(it.title) }));
  }
  return { events, unplaced: 0 };
}

// ── BKM: each play's page lists its sessions (date, time, venue) — Istanbul venues only ──────────
async function bkm(v: Venue): Promise<Result> {
  const r = await politeGet(v.lists![0]);
  if (r.status !== 200) throw new Error(`programme: HTTP ${r.status}`);
  const plays = linksMatching(r.text, r.url, /^\/tr\/etkinlikler\/[^/]+$/, v.maxPages ?? 25);
  if (!plays.length) throw new Error('programme: no play links (layout changed?)');
  const events: Ev[] = [];
  let unplaced = 0;
  const names = new Set<string>();
  for (const url of plays) {
    const d = await politeGet(url);
    if (d.status !== 200) continue;
    const title = pageTitle(d.text).replace(/\s*[|–-]\s*BKM.*$/i, '');
    for (const c of d.text.matchAll(/<div class="card-program([^"]*)">[\s\S]*?<div class="date">([^<]+)<\/div>\s*<div class="time">([^<]+)<\/div>[\s\S]*?<span>([^<]+)<\/span>/g)) {
      if (/past/.test(c[1])) continue;
      const where = clean(c[4]);
      if (/\/\s*(?!İSTANBUL)[A-ZÇĞİÖŞÜ]{3,}\s*$/.test(where)) continue; // another city ("Congresium Ankara / ANKARA")
      const occ = findOccurrences(`${clean(c[2])} ${clean(c[3])}`.replace(/(\d{1,2} \S+) (\S+) (\d{4})/, '$1 $3 $2'), now).filter(inWindow);
      if (!occ.length) continue;
      const place = await placeOrFind(where, names);
      if (!place) {
        unplaced++;
        continue;
      }
      for (const o of occ) events.push(make(v, place, title, o, url, { category: stageCategory(title) }));
    }
  }
  return { events, unplaced, note: names.size ? `not on the map: ${[...names].join(' · ')}` : undefined };
}

async function scrape(v: Venue): Promise<{ events: Ev[]; unplaced: number; note?: string }> {
  if (v.scraper === 'arter') return { events: await arter(v), unplaced: 0 };
  if (v.scraper === 'akbank') return akbank(v);
  if (v.scraper === 'sehir') return sehir(v);
  if (v.scraper === 'salon') return salon(v);
  if (v.scraper === 'fisekhane') return fisekhane(v);
  if (v.scraper === 'dasdas') return dasdas(v);
  if (v.scraper === 'kumbaraci') return kumbaraci(v);
  if (v.scraper === 'listtext') return listtext(v);
  if (v.scraper === 'uniq') return uniq(v);
  if (v.scraper === 'bkm') return bkm(v);
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

  // venues placed from their official address (hand-listed) — before scraping, so their events find them
  await geo.ensureExtra(extraVenues);
  for (const p of geo.places()) addPlace(p.id, p.name);

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
    if (v.disabled) {
      log[v.id] = { status: 'skipped', lastRun: last?.lastRun ?? stamp, count: 0, message: v.disabled };
      console.log(`· ${v.id}: skipped — ${v.disabled}`);
      continue;
    }
    console.log(`→ ${v.id} (${v.scraper})`);
    try {
      const { events, unplaced, note } = await scrape(v);
      const good = dedupeIds(events.filter(sane)).slice(0, MAX_PER_VENUE);
      if (!good.length && old.length) {
        keep('kept', `0 events now (layout change?)${unplaced ? `, ${unplaced} not on the map` : ''}`);
        continue;
      }
      all.push(...good);
      const status = good.length ? 'ok' : 'empty';
      log[v.id] = { status, lastRun: stamp, lastOk: good.length ? stamp : last?.lastOk, count: good.length, ...(unplaced ? { unplaced } : {}), ...(note ? { message: note } : {}) };
      console.log(`${good.length ? '✓' : '·'} ${v.id}: ${good.length} events${unplaced ? ` (${unplaced} at venues not on the map)` : ''}${note ? ` — ${note}` : ''}`);
    } catch (e) {
      keep(e instanceof Blocked ? 'blocked' : 'failed', e instanceof Error ? `${e.message}${e.cause ? ` (${String((e.cause as Error).message ?? e.cause)})` : ''}` : String(e));
    }
  }

  const events = dedupeIds(all).sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  writeFileSync(OUT, JSON.stringify({ generated: stamp, events }, null, 0) + '\n');
  geo.save();
  writeFileSync(LOG, JSON.stringify({ generated: stamp, venues: log, ...(geo.log.length ? { places: geo.log } : {}) }, null, 1) + '\n');
  console.log(`→ ${OUT}: ${events.length} events from ${new Set(events.map((e) => e.venue)).size} venues`);
}

function dedupeIds(l: Ev[]): Ev[] {
  const seen = new Set<string>();
  return l.filter((e) => !seen.has(e.id) && (seen.add(e.id), true));
}

if (process.argv[1]?.endsWith('scrape.ts')) void main();
