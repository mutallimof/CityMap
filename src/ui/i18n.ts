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
  feedTitle: { tr: 'Bugün şehirde', en: 'Today in the city' },
  demo: { tr: 'DEMO', en: 'DEMO' },
  demoNote: { tr: 'Örnek içerik — gerçek duyuru değildir. Mekân konumları OpenStreetMap’ten.', en: 'Sample content — not real announcements. Place locations from OpenStreetMap.' },
  all: { tr: 'Tümü', en: 'All' },
  saved: { tr: 'Kaydedilenler', en: 'Saved' },
  save: { tr: 'Kaydet', en: 'Save' },
  savedOne: { tr: 'Kaydedildi', en: 'Saved' },
  share: { tr: 'Paylaş', en: 'Share' },
  copied: { tr: 'Bağlantı kopyalandı', en: 'Link copied' },
  event: { tr: 'Etkinlik', en: 'Event' },
  offer: { tr: 'Fırsat', en: 'Offer' },
  news: { tr: 'Duyuru', en: 'News' },
  liveNow: { tr: 'Şu an', en: 'On now' },
  startsIn: { tr: 'başlıyor', en: 'starts in' },
  until: { tr: 'son gün', en: 'until' },
  ago: { tr: 'önce', en: 'ago' },
  openNow: { tr: 'Açık', en: 'Open now' },
  closedNow: { tr: 'Kapalı', en: 'Closed' },
  closes: { tr: 'kapanış', en: 'closes' },
  opens: { tr: 'açılış', en: 'opens' },
  hours: { tr: 'Çalışma saatleri', en: 'Opening hours' },
  hoursUnknown: { tr: 'Çalışma saatleri OSM’de yok', en: 'No opening hours in OSM' },
  posts: { tr: 'Paylaşımlar', en: 'Posts' },
  noPosts: { tr: 'Şu an paylaşım yok', en: 'Nothing posted right now' },
  noMatches: { tr: 'Bu filtrede bir şey yok', en: 'Nothing matches these filters' },
  nearestPier: { tr: 'En yakın iskele', en: 'Nearest pier' },
  locating: { tr: 'Konum alınıyor…', en: 'Finding you…' },
  locationDenied: { tr: 'Konum izni yok', en: 'Location not available' },
  notInIstanbul: { tr: 'İstanbul dışındasın — Karaköy gösteriliyor', en: "You're not in İstanbul — showing Karaköy" },
  walk: { tr: 'yürüme', en: 'walk' },
  sunsetIn: { tr: 'gün batımına', en: 'until sunset' },
  sunsetDone: { tr: 'Güneş battı — yarın', en: 'Sun has set — tomorrow' },
  bestSpots: { tr: 'En iyi noktalar', en: 'Best spots' },
  goldenHour: { tr: 'Altın saat', en: 'Golden hour' },
  nextFerry: { tr: 'Sonraki vapur', en: 'Next ferry' },
  fromPier: { tr: 'iskeleden', en: 'from' },
  location: { tr: 'Konum', en: 'Location' },
  weather: { tr: 'Hava', en: 'Weather' },
  kind_cafe: { tr: 'Kafe', en: 'Café' },
  kind_restaurant: { tr: 'Restoran', en: 'Restaurant' },
  kind_theatre: { tr: 'Tiyatro / sahne', en: 'Theatre / stage' },
  kind_arts_centre: { tr: 'Sanat merkezi', en: 'Arts centre' },
  kind_concert_hall: { tr: 'Konser salonu', en: 'Concert hall' },
  kind_venue: { tr: 'Sahne', en: 'Venue' },
  kind_museum: { tr: 'Müze', en: 'Museum' },
  kind_gallery: { tr: 'Galeri', en: 'Gallery' },
  kind_mall: { tr: 'Alışveriş merkezi', en: 'Shopping mall' },
  kind_bazaar: { tr: 'Çarşı', en: 'Bazaar' },
  kind_viewpoint: { tr: 'Gün batımı noktası', en: 'Sunset spot' },
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
