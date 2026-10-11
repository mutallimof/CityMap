import { allowed, parseRobots, type Rules } from './robots';

/**
 * Polite fetching for the venue scrapers: a clear User-Agent, robots.txt respected (and its
 * Crawl-delay), at least `minDelayMs` between requests to the same host, timeouts, no retries
 * hammering a site. Every request is logged.
 */
export const USER_AGENT = 'IstanbulLivingCityBot/0.1 (+https://mutallimof.github.io/CityMap/; events map; contact: github.com/mutallimof/CityMap/issues)';
const MIN_DELAY_MS = Number(process.env.SCRAPE_DELAY_MS ?? 4000);

const robots = new Map<string, Rules | 'blocked'>();
const lastAt = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Blocked extends Error {}

async function rulesFor(origin: string): Promise<Rules | 'blocked'> {
  if (robots.has(origin)) return robots.get(origin)!;
  let r: Rules | 'blocked';
  try {
    const res = await timedFetch(`${origin}/robots.txt`);
    if (res.status === 401 || res.status === 403) r = 'blocked';
    else if (!res.ok) r = { allow: [], disallow: [] }; // no robots.txt → allowed
    else r = parseRobots(await res.text(), 'IstanbulLivingCityBot');
  } catch {
    r = { allow: [], disallow: [] };
  }
  robots.set(origin, r);
  return r;
}

async function timedFetch(url: string, accept = 'text/html,application/json;q=0.9,*/*;q=0.5'): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25_000);
  try {
    return await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Language': 'tr,en;q=0.8' }, signal: ctl.signal, redirect: 'follow' });
  } finally {
    clearTimeout(t);
  }
}

/** GET a page if robots.txt allows it; waits so a host sees ≤ 1 request per MIN_DELAY_MS (or its Crawl-delay). */
export async function politeGet(url: string, accept?: string): Promise<{ status: number; text: string; url: string }> {
  const u = new URL(url);
  const rules = await rulesFor(u.origin);
  if (rules === 'blocked') throw new Blocked(`robots.txt forbidden (403) for ${u.origin}`);
  if (!allowed(rules, u.pathname + u.search)) throw new Blocked(`robots.txt disallows ${u.pathname}`);
  const gap = Math.max(MIN_DELAY_MS, (rules.crawlDelay ?? 0) * 1000);
  const wait = (lastAt.get(u.host) ?? 0) + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastAt.set(u.host, Date.now());
  const res = await timedFetch(url, accept);
  const text = await res.text();
  console.log(`  GET ${res.status} ${url} (${text.length} B)`);
  return { status: res.status, text, url: res.url || url };
}
