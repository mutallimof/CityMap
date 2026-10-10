import { CONFIG } from '../config';
import { CALM, demoConditions, easeConditions, fromOpenMeteo, parseDemo, seasonOf, type Conditions, type OpenMeteoCurrent, type Season } from './conditions';

export type WeatherSource = 'live' | 'demo' | 'offline';

/**
 * Live weather from Open-Meteo (free, no key; fetched by the visitor's browser every ~15 min),
 * or a demo preset from `?weather=…`. Season from the simulated date, or `?season=…`.
 * The scene eases towards new conditions over a few seconds (step()).
 */
export class WeatherController {
  readonly demo = parseDemo(location.search);
  target: Conditions = CALM;
  current: Conditions = CALM;
  source: WeatherSource = 'offline';
  private listeners = new Set<() => void>();
  private timer = 0;

  constructor(private now: () => number) {
    if (this.demo.weather) {
      this.target = this.current = demoConditions(this.demo.weather);
      this.source = 'demo';
    }
  }

  start(): void {
    if (this.demo.weather) return;
    const load = async () => {
      const c = await fetchCurrent();
      if (c) {
        this.target = c;
        this.source = 'live';
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
