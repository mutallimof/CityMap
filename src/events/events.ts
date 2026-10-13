/**
 * Venue events (facts only: title, date/time, venue, category, price, links), scraped daily on
 * GitHub's servers into data/events.json. Loaded lazily after the map is up.
 */
export type EventCategory = 'concert' | 'theatre' | 'dance' | 'exhibition' | 'workshop' | 'talk' | 'festival' | 'film' | 'kids' | 'other';

export interface CityEvent {
  id: string;
  venue: string;
  place: string;
  title: string;
  /** ISO 8601 with offset (+03:00). */
  start: string;
  end?: string;
  /** Date-only events (exhibitions, all-day programmes). */
  allDay?: boolean;
  category: EventCategory;
  free?: boolean;
  price?: string;
  url: string;
  tickets?: string;
}

/** data/events.json. `venues` (venue id → ISO time of its last successful scrape) is newer than the file format: old files lack it. */
export interface EventsFile {
  /** ISO time of the last scraper run. */
  generated?: string;
  venues?: Record<string, string>;
  events: CityEvent[];
}

/** Events of a venue not refreshed for longer than this are hidden (the scraper keeps a venue's last good events when it is blocked / fails). */
export const STALE_VENUE_MS = 3 * 86_400_000;

/**
 * The file's events minus those of stale venues: a venue with a refresh time older than `STALE_VENUE_MS`.
 * A file or venue without a refresh time (older files, venues that never succeeded) shows everything — never throws.
 */
export function freshEvents(file: Partial<EventsFile> | null | undefined, nowMs: number): CityEvent[] {
  const all = Array.isArray(file?.events) ? file.events : [];
  const times = file?.venues && typeof file.venues === 'object' ? file.venues : null;
  if (!times) return all;
  return all.filter((e) => {
    const t = Date.parse(times[e.venue] ?? '');
    return Number.isNaN(t) || nowMs - t <= STALE_VENUE_MS;
  });
}

/** "12 October 2026" / "12 Ekim 2026" (Istanbul date) of an ISO stamp, or null when missing / invalid. */
export function formatUpdated(iso: string | null | undefined, lang: 'tr' | 'en'): string | null {
  const t = Date.parse(iso ?? '');
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });
}

export interface EventFilters {
  today: boolean;
  weekend: boolean;
  workshops: boolean;
  free: boolean;
}

export const NO_EVENT_FILTERS: EventFilters = { today: false, weekend: false, workshops: false, free: false };
export const anyEventFilter = (f: EventFilters) => f.today || f.weekend || f.workshops || f.free;

const ISTANBUL_MS = 3 * 3_600_000;
/** Istanbul calendar day number (days since epoch) for a timestamp. */
export const dayOf = (ms: number) => Math.floor((ms + ISTANBUL_MS) / 86_400_000);
const DEFAULT_LEN_MS = 2 * 3_600_000;

export function startMs(e: CityEvent): number {
  return Date.parse(e.start);
}
export function endMs(e: CityEvent): number {
  if (e.end) return Date.parse(e.end);
  if (e.allDay) return (dayOf(startMs(e)) + 1) * 86_400_000 - ISTANBUL_MS - 1;
  return startMs(e) + DEFAULT_LEN_MS;
}

/** Long runs (exhibitions over several days) don't make a venue glow or pulse — they're always on. */
export const isLongRun = (e: CityEvent) => endMs(e) - startMs(e) > 30 * 3_600_000;

export function isNow(e: CityEvent, now: number): boolean {
  return !e.allDay && !isLongRun(e) && startMs(e) <= now && now <= endMs(e);
}

export function isToday(e: CityEvent, now: number): boolean {
  return !isLongRun(e) && dayOf(startMs(e)) === dayOf(now) && endMs(e) >= now;
}

/** Saturday + Sunday of this week (or the coming one), Istanbul time. */
export function weekendRange(now: number): [number, number] {
  const d = dayOf(now);
  const weekday = (new Date(d * 86_400_000).getUTCDay() + 6) % 7; // 0 = Monday
  const sat = weekday === 6 ? d - 1 : d + (5 - weekday);
  return [sat * 86_400_000 - ISTANBUL_MS, (sat + 2) * 86_400_000 - ISTANBUL_MS - 1];
}

export function matches(e: CityEvent, f: EventFilters, now: number): boolean {
  if (endMs(e) < now) return false;
  if (f.today || f.weekend) {
    const today = dayOf(startMs(e)) <= dayOf(now) && endMs(e) >= now && (isToday(e, now) || (isLongRun(e) && startMs(e) <= now));
    const [ws, we] = weekendRange(now);
    const weekend = startMs(e) <= we && endMs(e) >= Math.max(ws, now);
    if (!((f.today && today) || (f.weekend && weekend))) return false;
  }
  if (f.workshops && e.category !== 'workshop') return false;
  if (f.free && !e.free) return false;
  return true;
}

export class EventsStore {
  private byPlace = new Map<string, CityEvent[]>();
  private listeners = new Set<() => void>();
  all: CityEvent[] = [];
  /** ISO time the events file was generated (null: unknown). */
  generated: string | null = null;

  /** Load a data/events.json (any age of format); events of stale venues are left out. */
  setFile(file: Partial<EventsFile>, nowMs = Date.now()): void {
    this.generated = typeof file.generated === 'string' ? file.generated : null;
    this.set(freshEvents(file, nowMs));
  }

  set(events: CityEvent[]): void {
    this.all = [...events].sort((a, b) => startMs(a) - startMs(b));
    this.byPlace = new Map();
    for (const e of this.all) {
      const l = this.byPlace.get(e.place) ?? [];
      l.push(e);
      this.byPlace.set(e.place, l);
    }
    for (const fn of this.listeners) fn();
  }

  /** Upcoming (not finished) events at a place, soonest first. */
  upcoming(place: string, now: number, limit = 12): CityEvent[] {
    return (this.byPlace.get(place) ?? []).filter((e) => endMs(e) >= now).slice(0, limit);
  }

  status(place: string, now: number): 'now' | 'today' | null {
    const l = this.byPlace.get(place);
    if (!l) return null;
    if (l.some((e) => isNow(e, now))) return 'now';
    if (l.some((e) => isToday(e, now))) return 'today';
    return null;
  }

  placeMatches(place: string, f: EventFilters, now: number): boolean {
    return (this.byPlace.get(place) ?? []).some((e) => matches(e, f, now));
  }

  places(): string[] {
    return [...this.byPlace.keys()];
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const events = new EventsStore();
