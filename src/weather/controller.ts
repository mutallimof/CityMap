import { CONFIG } from '../config';
import { CALM, demoConditions, easeConditions, fromOpenMeteo, parseDemo, seasonOf, type Conditions, type OpenMeteoCurrent, type Season } from './conditions';

export type WeatherSource = 'live' | 'demo' | 'offline';

/** Whether data fetched at `fetchedAt` (ms, wall clock) is still young enough to show. */
export const weatherFresh = (fetchedAt: number | null, nowMs: number, maxAgeMs = CONFIG.weather.maxAgeMin * 60_000): boolean => fetchedAt !== null && nowMs - fetchedAt <= maxAgeMs;

/**
 * Live weather from Open-Meteo (free, no key; fetched by the visitor's browser every ~15 min),
 * or a demo preset from `?weather=…`. Season from the simulated date, or `?season=…`.
 * The scene eases towards new conditions over a few seconds (step()).
 */
export class WeatherController {
  readonly demo = parseDemo(location.search);
  target: Conditions = CALM;
  current: Conditions = CALM;
  /** Wall-clock time of the last successful fetch. */
  private fetchedAt: number | null = null;
  private expired = false;
  private listeners = new Set<() => void>();
  private timer = 0;

  constructor(
    private now: () => number,
    private wall: () => number = Date.now,
  ) {
    if (this.demo.weather) this.target = this.current = demoConditions(this.demo.weather);
  }

  /** 'live' only while the last successful fetch is under `maxAgeMin` old — a later run of failures hides the weather. */
  get source(): WeatherSource {
    if (this.demo.weather) return 'demo';
    return weatherFresh(this.fetchedAt, this.wall()) ? 'live' : 'offline';
  }

  start(): void {
    if (this.demo.weather) return;
    const load = async () => {
      const c = await fetchCurrent();
      if (c) {
        this.target = c;
        this.fetchedAt = this.wall();
        this.expired = false;
        this.emit();
      } else if (this.fetchedAt !== null && !this.expired && this.source === 'offline') {
        this.expired = true; // too old to trust: back to a calm scene, chip hidden
        this.target = CALM;
        this.emit();
      }
    };
    void load();
    this.timer = window.setInterval(load, CONFIG.weather.refreshMin * 60_000);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  season(): Season {
    return this.demo.season ?? seasonOf(new Date(this.now()));
  }

  /** Ease the visible conditions towards the target; dt in real seconds. */
  step(dt: number): Conditions {
    const k = 1 - Math.exp(-dt / Math.max(0.01, CONFIG.weather.easeS / 3));
    this.current = easeConditions(this.current, this.target, k);
    return this.current;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

async function fetchCurrent(): Promise<Conditions | null> {
  try {
    const res = await fetch(CONFIG.weather.url);
    if (!res.ok) return null;
    const j = (await res.json()) as { current?: OpenMeteoCurrent };
    return j.current ? fromOpenMeteo(j.current) : null;
  } catch {
    return null;
  }
}
