import { CONFIG } from '../config';

/**
 * Stories (history) for OSM features with a Wikidata link, pre-built monthly by
 * scripts/stories/build-stories.ts into data/stories.json. Loaded lazily when first needed (storiesNeeded) —
 * nothing is fetched from Wikipedia on the visitor's phone (photos come from Wikimedia's CDN).
 */
export interface Story {
  osm: string;
  wikidata: string;
  kind: string;
  name: { tr: string; en: string };
  lngLat: [number, number];
  year: number | null;
  architects: { tr: string; en: string }[];
  styles: { tr: string; en: string }[];
  summary: { tr: string | null; en: string | null };
  wiki: { tr: string | null; en: string | null };
  photo: { thumb: string; page: string; artist: string; license: string; licenseUrl: string } | null;
}

let stories = new Map<string, Story>();
const listeners = new Set<() => void>();

export function setStories(list: Record<string, Story>): void {
  stories = new Map(Object.entries(list));
  for (const fn of listeners) fn();
}

export const storyFor = (osm: string | null | undefined): Story | undefined => (osm ? stories.get(osm) : undefined);

/**
 * Whether the stories file is needed now (it loads once, lazily): story markers are about to appear
 * (within 0.4 zoom of CONFIG.places.storiesFrom), a place sheet is open (Story section) or the skyline test runs.
 */
export function storiesNeeded(s: { zoom: number; placeOpen: boolean; skyline: boolean }): boolean {
  return s.zoom >= CONFIG.places.storiesFrom - 0.4 || s.placeOpen || s.skyline;
}

export function onStories(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** "1348" · "c. 330 BC" style year for display. */
export function formatYear(y: number, lang: 'tr' | 'en'): string {
  if (y < 0) return lang === 'tr' ? `MÖ ${-y}` : `${-y} BC`;
  return String(y);
}

/** Summary in the visitor's language, else the other one (flagged so the UI can say so). */
export function pickSummary(s: Story, lang: 'tr' | 'en'): { text: string; url: string; lang: 'tr' | 'en' } | null {
  const other = lang === 'tr' ? 'en' : 'tr';
  for (const l of [lang, other] as const) if (s.summary[l] && s.wiki[l]) return { text: s.summary[l]!, url: s.wiki[l]!, lang: l };
  return null;
}
