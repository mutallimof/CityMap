/**
 * Development probe (runs in GitHub Actions; the dev sandbox can't reach venue sites): fetches
 * each venue's start pages politely and saves them + a summary for writing scrapers.
 *   out: probe/<venue>-<n>.html, probe/summary.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { politeGet, politePost } from './http';

interface Venue {
  id: string;
  start: string[];
  extra?: string[];
}
const { venues } = JSON.parse(await (await import('node:fs/promises')).readFile('data/catalog/venues.json', 'utf8')) as { venues: Venue[] };
const only = process.env.VENUES ? process.env.VENUES.split(',') : null;
const extraUrls = (process.env.EXTRA_URLS ?? '').split(/\s+/).filter(Boolean);
mkdirSync('probe', { recursive: true });
const summary: Record<string, unknown>[] = [];

const ldTypes = (html: string) =>
  [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].slice(0, 200).replace(/\s+/g, ' '));
const links = (html: string, base: string) =>
  [...new Set([...html.matchAll(/href="([^"#]+)"/gi)].map((m) => { try { return new URL(m[1], base).href; } catch { return ''; } }))]
    .filter((h) => h.startsWith(new URL(base).origin) && /etkinlik|event|program|takvim|calendar|sergi|exhibit|konser|concert|atolye|workshop|oyun|tiyatro|seans/i.test(h))
    .slice(0, 60);

const jobs: { id: string; url: string; post?: { body: string; type: string } }[] = [];
// Extra requests for this probe round (JSON endpoints + sample event pages).
const probe2 = JSON.parse(process.env.PROBE_JOBS ?? '[]') as { id: string; url: string; post?: { body: string; type: string } }[];
jobs.push(...probe2);
if (!probe2.length) for (const v of venues) if (!only || only.includes(v.id)) for (const u of [...v.start, ...(v.extra ?? [])]) jobs.push({ id: v.id, url: u });
for (const u of extraUrls) jobs.push({ id: new URL(u).hostname.replace(/^www\./, '').split('.')[0] + '-x', url: u });

let n = 0;
for (const j of jobs) {
  n++;
  try {
    const r = j.post ? await politePost(j.url, j.post.body, j.post.type) : await politeGet(j.url);
    const file = `probe/${j.id}-${n}.html`;
    writeFileSync(file, r.text);
    summary.push({ venue: j.id, url: j.url, final: r.url, status: r.status, bytes: r.text.length, file, ld: ldTypes(r.text), links: links(r.text, r.url), feeds: [...r.text.matchAll(/href="([^"]+\.(?:ics|rss|xml)[^"]*)"/gi)].map((m) => m[1]).slice(0, 10) });
  } catch (e) {
    console.log(`  ✗ ${j.url}: ${(e as Error).message}`);
    summary.push({ venue: j.id, url: j.url, error: (e as Error).message });
  }
}
writeFileSync('probe/summary.json', JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary.map((s) => [s.venue, s.status ?? s.error, s.bytes, s.url]), null, 0));
