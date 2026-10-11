/**
 * Shared parsing for the venue scrapers: HTML → text, Turkish dates/times, categories, links.
 * Facts only — we never keep descriptions or images.
 */
const MONTHS: Record<string, number> = {
  ocak: 1, oca: 1, şubat: 2, şub: 2, mart: 3, mar: 3, nisan: 4, nis: 4, mayıs: 5, may: 5, haziran: 6, haz: 6,
  temmuz: 7, tem: 7, ağustos: 8, ağu: 8, eylül: 9, eyl: 9, ekim: 10, eki: 10, kasım: 11, kas: 11, aralık: 12, ara: 12,
};
const MONTH_RE = '(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık|Oca|Şub|Mar|Nis|May|Haz|Tem|Ağu|Eyl|Eki|Kas|Ara)';
const WEEKDAY_RE = '(?:Pazartesi|Salı|Çarşamba|Perşembe|Cuma|Cumartesi|Pazar|Pzt|Sal|Çar|Per|Cum|Cmt|Paz)';

export const monthOf = (s: string): number => MONTHS[s.toLocaleLowerCase('tr')] ?? 0;

export function htmlToText(html: string): string {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' | ')
      .replace(/<\/(p|div|li|h\d|span|td|tr|a|section|article)>/gi, ' | ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s*\|\s*(\|\s*)*/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export const clean = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** <meta property="og:title"> or the first <h1>. */
export function pageTitle(html: string): string {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html) ?? /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(html);
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const t = clean(h1?.[1] ?? '') || clean(og?.[1] ?? '');
  return t.replace(/\s*[|–-]\s*(İstanbul Modern|Pera Müzesi|SALT|Salt|Arter|İKSV|Borusan.*|Akbank Sanat|İBB.*)$/i, '').trim();
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Istanbul local date/time → ISO 8601 with +03:00. */
export const iso = (y: number, m: number, d: number, hh = 0, mm = 0) => `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00+03:00`;

/** Year for a day/month without a year: the next occurrence not more than ~2 months in the past. */
export function inferYear(m: number, d: number, now: Date): number {
  const y = now.getUTCFullYear();
  const cand = Date.UTC(y, m - 1, d);
  return cand < now.getTime() - 62 * 86_400_000 ? y + 1 : y;
}

export interface Occurrence {
  start: string;
  end?: string;
  allDay?: boolean;
}

/**
 * Every date (with optional time) in a text, in order:
 *   "17 Ekim 2026 · 14.00" · "16 Eylül 2026 / 13.30" · "14 Ekim Çarşamba, 20:00" · "11 Ekim 2026 Pazar | 17:30"
 *   "16 Eyl 2026 – 14 Mar 2027" (range → one all-day run) · "24.10.2026 19:30"
 */
export function findOccurrences(text: string, now: Date): Occurrence[] {
  const out: Occurrence[] = [];
  const range = new RegExp(`(\\d{1,2})\\s*${MONTH_RE}?\\s*(\\d{4})?\\s*[–—-]\\s*(\\d{1,2})\\s*${MONTH_RE}\\s*(\\d{4})`, 'gi');
  const ranges: [number, number][] = [];
  for (const m of text.matchAll(range)) {
    const y2 = Number(m[6]);
    const m2 = monthOf(m[5]);
    const m1 = m[2] ? monthOf(m[2]) : m2;
    const y1 = m[3] ? Number(m[3]) : m1 > m2 ? y2 - 1 : y2;
    if (!m1 || !m2) continue;
    out.push({ start: iso(y1, m1, Number(m[1])), end: iso(y2, m2, Number(m[4]), 23, 59), allDay: true });
    ranges.push([m.index!, m.index! + m[0].length]);
  }
  const single = new RegExp(`(\\d{1,2})\\s+${MONTH_RE}\\.?\\s*(\\d{4})?(?:\\s*,?\\s*${WEEKDAY_RE})?(?:\\s*[·/,|]?\\s*(?:\\|\\s*)?(?:saat\\s*)?(\\d{1,2})[.:](\\d{2}))?`, 'gi');
  for (const m of text.matchAll(single)) {
    if (ranges.some(([a, b]) => m.index! >= a && m.index! < b)) continue;
    const mon = monthOf(m[2]);
    const day = Number(m[1]);
    if (!mon || day < 1 || day > 31) continue;
    const y = m[3] ? Number(m[3]) : inferYear(mon, day, now);
    if (m[4] !== undefined) {
      const hh = Number(m[4]);
      const mm = Number(m[5]);
      if (hh > 23 || mm > 59) continue;
      out.push({ start: iso(y, mon, day, hh, mm) });
    } else out.push({ start: iso(y, mon, day), allDay: true });
  }
  for (const m of text.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s*[-–,/|]?\s*(\d{1,2})[.:](\d{2}))?/g)) {
    const [d, mon, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mon < 1 || mon > 12 || d < 1 || d > 31) continue;
    out.push(m[4] !== undefined ? { start: iso(y, mon, d, Number(m[4]), Number(m[5])) } : { start: iso(y, mon, d), allDay: true });
  }
  return out;
}

const CATS: [RegExp, string][] = [
  [/atölye|atolye|workshop|masterclass|çocuk atölye/i, 'workshop'],
  [/sergi turu|rehberli tur|guided tour|exhibition tour/i, 'talk'],
  [/söyleşi|soylesi|konuşma|panel|seminer|sohbet|talk|conversation|okuma|lecture|konferans/i, 'talk'],
  [/sergi|exhibition|koleksiyon/i, 'exhibition'],
  [/konser|concert|resital|caz|jazz|orkestra|dinleti|müzik/i, 'concert'],
  [/tiyatro|oyun|theatre|play/i, 'theatre'],
  [/dans|dance|bale|ballet/i, 'dance'],
  [/film|sinema|cinema|gösterim|screening/i, 'film'],
  [/festival/i, 'festival'],
  [/çocuk|kids|aile/i, 'kids'],
];
export function guessCategory(...hints: string[]): string {
  const s = hints.join(' ');
  for (const [re, c] of CATS) if (re.test(s)) return c;
  return 'other';
}

export const isFree = (text: string) => /ücretsiz|ucretsiz|free (admission|entry|of charge)|giriş serbest/i.test(text);

export function priceIn(text: string): string | undefined {
  const m = /(\d{2,5}(?:[.,]\d{2})?)\s*(?:TL|₺)/.exec(text);
  return m ? `${m[1]} TL` : undefined;
}

export const RESELLER = /(^|\.)(biletix|passo|bubilet|biletinial|mobilet)\./i;

export function absolute(href: string, base: string): string | null {
  try {
    const u = new URL(decode(href), base);
    return /^https?:$/.test(u.protocol) ? u.href.replace(/^http:/, 'https:') : null;
  } catch {
    return null;
  }
}

/** All same-site links whose path matches `re` (deduped, in page order). */
export function linksMatching(html: string, base: string, re: RegExp, limit = 30): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    const u = absolute(m[1], base);
    if (!u || new URL(u).host !== new URL(base).host || !re.test(new URL(u).pathname)) continue;
    if (!out.includes(u)) out.push(u);
    if (out.length >= limit) break;
  }
  return out;
}

/** An official (non-reseller) ticket link on the page, if any. */
export function ticketLink(html: string, base: string): string | undefined {
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!/bilet|ticket/i.test(clean(m[2])) && !/bilet|ticket/i.test(m[1])) continue;
    const u = absolute(m[1], base);
    if (u && !RESELLER.test(new URL(u).hostname)) return u;
  }
  return undefined;
}

/**
 * A list of dates sharing months/years, as programme pages write them:
 *   "19/20/21 Kasım 2026" · "3, 10, 17, 24 Kasım, 1 ve 8 Aralık 2026" · "24 ve 28 Kasım 2025"
 *   "15 Kasım 2026'ya kadar" (a run until then → one all-day run from today). Anything else → [].
 */
export function parseDateList(text: string, now: Date): Occurrence[] {
  const days: { d: number; m: number; y?: number }[] = [];
  let pending: number[] = [];
  for (const t of text.matchAll(new RegExp(`(\\d{4})|(\\d{1,2})|${MONTH_RE}`, 'gi'))) {
    if (t[1]) {
      for (const x of days) x.y ??= Number(t[1]);
    } else if (t[2]) pending.push(Number(t[2]));
    else {
      const m = monthOf(t[3]);
      for (const d of pending) if (d >= 1 && d <= 31) days.push({ d, m });
      pending = [];
    }
  }
  const dated = days.map((x) => ({ ...x, y: x.y ?? inferYear(x.m, x.d, now) }));
  if (/kadar|until/i.test(text) && dated.length) {
    const last = dated[dated.length - 1];
    const today = new Date(now.getTime() + 3 * 3_600_000);
    return [{ start: iso(today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate()), end: iso(last.y, last.m, last.d, 23, 59), allDay: true }];
  }
  return dated.map((x) => ({ start: iso(x.y, x.m, x.d), allDay: true }));
}

/** Plain, accent-free lower case for matching venue names ("Kağıthane" → "kagithane"). */
export const norm = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
