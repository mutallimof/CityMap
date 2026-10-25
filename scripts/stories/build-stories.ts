/**
 * Stories for historic places (runs in GitHub Actions, monthly — never from users' phones):
 *   1. OpenStreetMap (Overpass): features in our area with a `wikidata` tag that are landmarks,
 *      historic buildings, museums, mosques/churches/synagogues, palaces, towers, fortresses…
 *   2. Wikidata: year built (P571 inception), architect (P84), architectural style (P149), image (P18),
 *      Wikipedia sitelinks (trwiki / enwiki).
 *   3. Wikipedia REST: the article summary in Turkish and English (CC BY-SA 4.0, credited in the UI).
 *   4. Wikimedia Commons: one photo (thumbnail URL) with author and licence.
 *   out: data/stories.json
 *
 * Polite: a descriptive User-Agent (Wikimedia policy), requests one at a time with a short pause.
 * Run: npm run data:stories
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { userAgent } from '../lib/app';
import { CONFIG } from '../../src/config';

const UA = userAgent('stories');
const OUT = 'data/stories.json';
const OVERPASS = (process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter,https://overpass.private.coffee/api/interpreter').split(',');
const MAX_SUMMARY = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string, init: RequestInit = {}, tries = 3): Promise<Response> {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, 'Api-User-Agent': UA, ...(init.headers ?? {}) } });
    if (res.ok || i >= tries - 1 || (res.status < 500 && res.status !== 429)) return res;
    await sleep(2000 * 2 ** i);
  }
}

interface OsmEl {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
}

/** What kind of story place this is (drives the marker + label in the sheet). */
export function storyKind(t: Record<string, string>): string | null {
  const b = t.building ?? '';
  if (t.amenity === 'place_of_worship') return t.religion === 'muslim' || b === 'mosque' ? 'mosque' : t.religion === 'jewish' ? 'synagogue' : 'church';
  if (t.tourism === 'museum' || t.tourism === 'gallery') return 'museum';
  if (t.historic === 'castle' || t.historic === 'fort' || t.historic === 'city_gate' || t.historic === 'citywalls') return 'fortress';
  if (b === 'palace' || t.historic === 'palace' || t.castle_type === 'palace') return 'palace';
  if (t.man_made === 'tower' || t.man_made === 'lighthouse' || b === 'tower' || t.historic === 'tower') return 'tower';
  if (t.man_made === 'bridge' || t.bridge) return 'bridge';
  if (t.historic && t.historic !== 'memorial' && t.historic !== 'wayside_cross' && t.historic !== 'boundary_stone') return 'historic';
  if (t.tourism === 'attraction') return 'landmark';
  return null;
}

async function overpass(): Promise<OsmEl[]> {
  const [w, s, e, n] = CONFIG.bounds;
  const bb = `${s},${w},${n},${e}`;
  const q = `[out:json][timeout:180];
(
  nwr["wikidata"]["historic"](${bb});
  nwr["wikidata"]["tourism"~"^(museum|gallery|attraction)$"](${bb});
  nwr["wikidata"]["amenity"="place_of_worship"](${bb});
  nwr["wikidata"]["building"~"^(mosque|church|palace|tower|castle)$"](${bb});
  nwr["wikidata"]["man_made"~"^(tower|lighthouse)$"](${bb});
);
out tags center;`;
  for (const url of OVERPASS) {
    try {
      const res = await get(url, { method: 'POST', body: new URLSearchParams({ data: q }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (!res.ok) throw new Error(`${res.status}`);
      const j = (await res.json()) as { elements: OsmEl[] };
      console.log(`Overpass ${url}: ${j.elements.length} elements`);
      return j.elements;
    } catch (err) {
      console.warn(`Overpass ${url} failed: ${(err as Error).message}`);
    }
  }
  throw new Error('all Overpass endpoints failed');
}

interface WdEntity {
  labels?: Record<string, { value: string }>;
  claims?: Record<string, { mainsnak: { datavalue?: { value: unknown } } }[]>;
  sitelinks?: Record<string, { title: string }>;
}

async function wikidata(ids: string[]): Promise<Map<string, WdEntity>> {
  const out = new Map<string, WdEntity>();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${batch.join('|')}&props=labels|claims|sitelinks&languages=tr|en&sitefilter=trwiki|enwiki`;
    const res = await get(url);
    if (!res.ok) throw new Error(`wikidata ${res.status}`);
    const j = (await res.json()) as { entities: Record<string, WdEntity> };
    for (const [k, v] of Object.entries(j.entities)) out.set(k, v);
    await sleep(300);
  }
  return out;
}

const claimIds = (e: WdEntity, p: string): string[] =>
  (e.claims?.[p] ?? []).map((c) => (c.mainsnak.datavalue?.value as { id?: string } | undefined)?.id).filter((x): x is string => !!x);

/** Wikidata time "+1348-00-00T00:00:00Z" (precision ignored) → year; negative years kept. */
export function yearOf(e: WdEntity): number | null {
  const v = e.claims?.P571?.[0]?.mainsnak.datavalue?.value as { time?: string } | undefined;
  const m = v?.time && /^([+-]\d+)-/.exec(v.time);
  return m ? Number(m[1]) : null;
}

async function summary(lang: 'tr' | 'en', title: string): Promise<{ text: string; url: string } | null> {
  const res = await get(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
  await sleep(150);
  if (!res.ok) return null;
  const j = (await res.json()) as { extract?: string; type?: string; content_urls?: { desktop?: { page?: string } } };
  if (!j.extract || j.type === 'disambiguation') return null;
  return { text: trimSummary(j.extract), url: j.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}` };
}

/** Keep whole sentences up to ~MAX_SUMMARY characters. */
export function trimSummary(s: string, max = MAX_SUMMARY): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > max * 0.4 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
}

const strip = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function commons(file: string): Promise<Record<string, string> | null> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&titles=${encodeURIComponent('File:' + file)}`;
  const res = await get(url);
  await sleep(150);
  if (!res.ok) return null;
  const j = (await res.json()) as { query?: { pages?: Record<string, { imageinfo?: { thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value: string }> }[] }> } };
  const ii = Object.values(j.query?.pages ?? {})[0]?.imageinfo?.[0];
  if (!ii?.thumburl) return null;
  const md = ii.extmetadata ?? {};
  const license = strip(md.LicenseShortName?.value ?? '');
  // Only freely licensed images (Commons hosts some fair-use-free but restricted files too).
  if (!/^(CC|Public domain|PD|CC0|GFDL|Attribution)/i.test(license)) return null;
  return {
    thumb: ii.thumburl,
    page: ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`,
    artist: strip(md.Artist?.value ?? '').slice(0, 120) || 'Unknown',
    license,
    licenseUrl: md.LicenseUrl?.value ?? '',
  };
}

async function main(): Promise<void> {
  const els = (await overpass()).filter((e) => storyKind(e.tags) && /^Q\d+$/.test(e.tags.wikidata));
  console.log(`${els.length} OSM features with wikidata + a story kind`);
  const ids = [...new Set(els.map((e) => e.tags.wikidata))];
  const wd = await wikidata(ids);
  const labelCache = new Map<string, Record<string, string>>();
  const needLabels = new Set<string>();
  for (const e of wd.values()) for (const p of ['P84', 'P149']) claimIds(e, p).forEach((q) => needLabels.add(q));
  const lab = await wikidata([...needLabels]);
  for (const [k, v] of lab) labelCache.set(k, { tr: v.labels?.tr?.value ?? v.labels?.en?.value ?? '', en: v.labels?.en?.value ?? v.labels?.tr?.value ?? '' });

  const prev = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as { stories: Record<string, unknown> }).stories : {};
  const stories: Record<string, unknown> = {};
  let n = 0;
  const seenQ = new Set<string>();
  for (const el of els) {
    const q = el.tags.wikidata;
    if (seenQ.has(q)) continue; // one map feature per Wikidata item
    const e = wd.get(q);
    if (!e) continue;
    const tr = e.sitelinks?.trwiki?.title;
    const en = e.sitelinks?.enwiki?.title;
    if (!tr && !en) continue;
    seenQ.add(q);
    const ref = `${el.type}/${el.id}`;
    try {
      const [sTr, sEn] = [tr ? await summary('tr', tr) : null, en ? await summary('en', en) : null];
      if (!sTr && !sEn) continue;
      const image = (e.claims?.P18?.[0]?.mainsnak.datavalue?.value as string | undefined) ?? null;
      const photo = image ? await commons(image) : null;
      const names = (ids: string[]) => ids.map((i) => labelCache.get(i)).filter((x): x is Record<string, string> => !!x && !!(x.tr || x.en));
      const c = el.center ?? { lat: el.lat!, lon: el.lon! };
      stories[ref] = {
        osm: ref,
        wikidata: q,
        kind: storyKind(el.tags),
        name: { tr: el.tags.name ?? e.labels?.tr?.value ?? e.labels?.en?.value ?? '', en: el.tags['name:en'] ?? e.labels?.en?.value ?? el.tags.name ?? '' },
        lngLat: [Number(c.lon.toFixed(6)), Number(c.lat.toFixed(6))],
        year: yearOf(e),
        architects: names(claimIds(e, 'P84')),
        styles: names(claimIds(e, 'P149')),
        summary: { tr: sTr?.text ?? null, en: sEn?.text ?? null },
        wiki: { tr: sTr?.url ?? null, en: sEn?.url ?? null },
        photo,
      };
      n++;
      if (n % 25 === 0) console.log(`  … ${n} stories`);
    } catch (err) {
      console.warn(`  ✗ ${ref} ${q}: ${(err as Error).message}`);
      if (prev[ref]) stories[ref] = prev[ref]; // keep last good
    }
  }
  writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), credit: 'Wikipedia (CC BY-SA 4.0), Wikidata (CC0), Wikimedia Commons (see each photo)', stories }));
  console.log(`→ ${OUT}: ${n} stories (${Object.keys(stories).length} incl. kept)`);
}

if (process.argv[1]?.endsWith('build-stories.ts')) await main();
