import { useUi, type Lang } from './store';

const STRINGS = {
  simulated: { tr: 'Simüle sefer', en: 'Simulated schedule' },
  tapHint: { tr: 'Bir vapura dokun', en: 'Tap a vapur' },
  now: { tr: 'Şimdi', en: 'Now' },
  next: { tr: 'Sonraki', en: 'Next' },
  at: { tr: 'İskelede', en: 'At' },
  departsIn: { tr: 'kalkışa', en: 'departs in' },
  arrivesIn: { tr: 'varışa', en: 'arrives in' },
  follow: { tr: 'Takip et', en: 'Follow' },
  following: { tr: 'Takipte', en: 'Following' },
  close: { tr: 'Kapat', en: 'Close' },
  nextDepartures: { tr: 'Sonraki kalkışlar', en: 'Next departures' },
  noDepartures: { tr: 'Bugün başka sefer yok', en: 'No more departures today' },
  noService: { tr: 'Bu iskeleye şu an hat yok', en: 'No line serves this pier yet' },
  min: { tr: 'dk', en: 'min' },
  departing: { tr: 'kalkıyor', en: 'departing' },
  to: { tr: '→', en: '→' },
  nearby: { tr: 'Yakında', en: 'Nearby' },
  comingSoon: { tr: 'Yakında', en: 'Coming soon' },
  time: { tr: 'Zaman', en: 'Time' },
  speed: { tr: 'Hız', en: 'Speed' },
  sunrise: { tr: 'Gün doğumu', en: 'Sunrise' },
  sunset: { tr: 'Gün batımı', en: 'Sunset' },
  night: { tr: 'Gece', en: 'Night' },
  ferries: { tr: 'Vapurlar', en: 'Ferries' },
  routes: { tr: 'Hatlar', en: 'Routes' },
  food: { tr: 'Yeme-içme', en: 'Food' },
  culture: { tr: 'Kültür', en: 'Culture' },
  shopping: { tr: 'Alışveriş', en: 'Shopping' },
  events: { tr: 'Etkinlik', en: 'Events' },
  tonight: { tr: 'Bu akşam', en: 'Tonight' },
  docked: { tr: 'İskelede', en: 'Docked' },
  underway: { tr: 'Seferde', en: 'Underway' },
  progress: { tr: 'Yolculuk', en: 'Trip' },
  inService: { tr: 'seferde', en: 'in service' },
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(lang: Lang, key: StringKey): string {
  return STRINGS[key][lang];
}

export function useT(): (key: StringKey) => string {
  const lang = useUi((s) => s.lang);
  return (key) => STRINGS[key][lang];
}

/** "4 dk" / "4 min", "now" under 30 s, "1 h 05" over an hour. */
export function formatWait(seconds: number, lang: Lang): string {
  if (seconds < 30) return t(lang, 'now');
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} ${t(lang, 'min')}`;
  return `${Math.floor(m / 60)} ${lang === 'tr' ? 'sa' : 'h'} ${String(m % 60).padStart(2, '0')}`;
}

/** m:ss countdown. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
