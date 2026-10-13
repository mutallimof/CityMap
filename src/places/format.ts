/**
 * Display cleanup for raw OpenStreetMap text in place sheets and lists (pure, never invents a value):
 * semicolon lists → "A, B", ALL-CAPS names / districts → Title Case (Turkish casing rules for the Turkish
 * UI: İ / ı), lowercase cuisine tags → "Turkish", Turkish phone numbers → "+90 505 096 26 23".
 * Anything it can't read with confidence comes back unchanged.
 */
import type { Lang } from '../ui/store';

const locale = (lang: Lang) => (lang === 'tr' ? 'tr' : 'en');
const TURKISH_LETTER = /[ıİğĞşŞçÇöÖüÜ]/;

const lower = (s: string, loc: string) => s.toLocaleLowerCase(loc).replace(/̇/g, ''); // en: "İ" lowers to i + combining dot
const capitalize = (w: string, loc: string) => (w ? w.charAt(0).toLocaleUpperCase(loc) + w.slice(1) : w);

/** "A;B" / "A; B" → "A, B" (empty parts dropped, repeats kept once). */
export function joinList(s: string): string {
  const parts = s.split(';').map((x) => x.trim()).filter(Boolean);
  return [...new Set(parts)].join(', ');
}

const LOWER_CONNECTORS = new Set(['VE', 'İLE', 'ILE', 'AND', 'OF', 'THE', 'DE', 'DA']);
const letters = (w: string) => [...w].filter((c) => c.toLocaleLowerCase('tr') !== c.toLocaleUpperCase('tr')).length;

/**
 * "GÜNGÖREN" → "Güngören", "KADIKÖY BELEDİYESİ" → "Kadıköy Belediyesi". Only strings that are ALL CAPS
 * and have a word of 5+ letters are touched (so "AKM", "BKM", "SALT" stay as the acronyms they are); in
 * those, 2–3 letter words are kept as written unless they are a connector (VE → ve).
 */
export function fixCaps(s: string, lang: Lang): string {
  if (!s || s !== s.toLocaleUpperCase(locale(lang)) && s !== s.toUpperCase()) return s;
  const words = s.split(/(\s+|-|\/)/);
  if (!words.some((w) => letters(w) >= 5)) return s;
  const loc = locale(lang);
  return words
    .map((w) => {
      if (!w.trim() || /^[-/]$/.test(w) || /\d/.test(w) || w.includes('.')) return w;
      const n = letters(w);
      if (n <= 3) return LOWER_CONNECTORS.has(w) ? lower(w, loc) : w;
      return capitalize(lower(w, loc), loc);
    })
    .join('');
}

/** A place name or district for display: lists joined, ALL CAPS fixed. */
export function cleanName(s: string | null | undefined, lang: Lang): string {
  return fixCaps(joinList(s ?? ''), lang);
}

/** "turkish;kebab" / "Italian_pizza" → "Turkish, Kebab" / "Italian pizza". OSM cuisine values are English keys → English casing. */
export function formatCuisine(s: string | null | undefined, lang: Lang): string {
  return (s ?? '')
    .split(/[;,]/)
    .map((x) => x.trim().replace(/_/g, ' '))
    .filter(Boolean)
    .map((x) => capitalize(x, lang === 'tr' && TURKISH_LETTER.test(x) ? 'tr' : 'en'))
    .join(', ');
}

/** One phone number: Turkish numbers as "+90 505 096 26 23" (mobile, landline, 0850 …); others unchanged. */
export function formatPhone(raw: string): string {
  const s = raw.trim();
  const plus = s.startsWith('+');
  const d = s.replace(/\D/g, '');
  let national: string | null = null;
  if (plus || s.startsWith('00')) {
    const intl = s.startsWith('00') ? d.slice(2) : d;
    if (intl.startsWith('90') && intl.length === 12) national = intl.slice(2);
    else return s; // another country: don't guess its grouping
  } else if (d.length === 12 && d.startsWith('90')) national = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) national = d.slice(1);
  else if (d.length === 10 && /^[2-5]/.test(d)) national = d;
  if (!national || !/^[2-58]\d{9}$/.test(national)) return s;
  return `+90 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6, 8)} ${national.slice(8)}`;
}

/** A phone field (may hold several numbers separated by ";" or ",") as formatted numbers. */
export function phoneList(raw: string | null | undefined): string[] {
  return (raw ?? '').split(/[;]/).map((x) => x.trim()).filter(Boolean).map(formatPhone);
}

/** `tel:` target for a formatted / raw number (digits and a leading +). */
export const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`;
