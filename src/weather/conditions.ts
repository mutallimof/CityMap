/**
 * Weather + season model (pure). Live conditions come from Open-Meteo (WMO weather codes);
 * `?weather=rain&season=spring` overrides them for demos.
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const DEMO_WEATHER = ['clear', 'cloudy', 'rain', 'storm', 'fog', 'snow', 'wind'] as const;
export type DemoWeather = (typeof DEMO_WEATHER)[number];

/** All intensities 0–1. */
export interface Conditions {
  rain: number;
  snow: number;
  fog: number;
  cloud: number;
  thunder: number;
  /** Wind speed (m/s) and the direction it blows FROM (meteorological degrees). */
  windMs: number;
  windFrom: number;
  tempC: number | null;
  /** WMO weather code (for the chip icon). */
  code: number;
}

export const CALM: Conditions = { rain: 0, snow: 0, fog: 0, cloud: 0.15, thunder: 0, windMs: 2.2, windFrom: 35, tempC: null, code: 1 };

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Meteorological seasons for Istanbul from the (simulated) date. */
export function seasonOf(date: Date): Season {
  const m = date.getUTCMonth(); // 0 = Jan; Istanbul is UTC+3 so the month edge is off by ≤3 h — fine.
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

export interface OpenMeteoCurrent {
  temperature_2m?: number;
  weather_code?: number;
  wind_speed_10m?: number;
  wind_direction_10m?: number;
  cloud_cover?: number;
  precipitation?: number;
  visibility?: number;
}

const RAIN: Record<number, number> = { 51: 0.25, 53: 0.35, 55: 0.45, 56: 0.3, 57: 0.45, 61: 0.45, 63: 0.7, 65: 1, 66: 0.5, 67: 0.8, 80: 0.5, 81: 0.75, 82: 1, 95: 0.9, 96: 1, 99: 1 };
const SNOW: Record<number, number> = { 71: 0.4, 73: 0.7, 75: 1, 77: 0.3, 85: 0.6, 86: 1 };
const CLOUD: Record<number, number> = { 0: 0, 1: 0.2, 2: 0.5, 3: 0.9, 45: 0.8, 48: 0.8 };

/** Open-Meteo `current` block (wind in m/s) → effect intensities. */
export function fromOpenMeteo(c: OpenMeteoCurrent): Conditions {
  const code = c.weather_code ?? 0;
  let rain = RAIN[code] ?? 0;
  const snow = SNOW[code] ?? 0;
  if (rain && c.precipitation != null) rain = clamp01(Math.max(rain, 0.25 + c.precipitation / 4));
  let fog = code === 45 || code === 48 ? 0.85 : 0;
  if (c.visibility != null && c.visibility < 5000) fog = Math.max(fog, clamp01(((5000 - c.visibility) / 5000) * 0.85));
  let cloud = c.cloud_cover != null ? c.cloud_cover / 100 : CLOUD[code] ?? 0.3;
  if (rain || snow) cloud = Math.max(cloud, 0.8);
  return {
    rain,
    snow,
    fog,
    cloud: clamp01(cloud),
    thunder: code >= 95 ? 1 : 0,
    windMs: c.wind_speed_10m ?? CALM.windMs,
    windFrom: c.wind_direction_10m ?? CALM.windFrom,
    tempC: c.temperature_2m ?? null,
    code,
  };
}

/** Demo presets for `?weather=`. */
export function demoConditions(name: DemoWeather): Conditions {
  const base = { ...CALM, tempC: null };
  switch (name) {
    case 'clear':
      return { ...base, cloud: 0, code: 0 };
    case 'cloudy':
      return { ...base, cloud: 0.9, code: 3 };
    case 'rain':
      return { ...base, rain: 0.75, cloud: 0.9, windMs: 5, windFrom: 200, code: 63 };
    case 'storm':
      return { ...base, rain: 1, cloud: 1, thunder: 1, windMs: 14, windFrom: 210, code: 95 };
    case 'fog':
      return { ...base, fog: 0.9, cloud: 0.7, windMs: 1, code: 45 };
    case 'snow':
      return { ...base, snow: 0.85, cloud: 0.85, windMs: 3, windFrom: 30, code: 73 };
    case 'wind':
      return { ...base, cloud: 0.35, windMs: 13, windFrom: 30, code: 2 };
  }
}

export function parseDemo(search: string): { weather: DemoWeather | null; season: Season | null } {
  const p = new URLSearchParams(search);
  const w = p.get('weather') as DemoWeather | null;
  const s = p.get('season') as Season | null;
  return { weather: w && DEMO_WEATHER.includes(w) ? w : null, season: s && SEASONS.includes(s) ? s : null };
}

/** Ease every numeric field of `a` towards `b` by `k` (0–1); wind direction along the short arc. */
export function easeConditions(a: Conditions, b: Conditions, k: number): Conditions {
  const lerp = (x: number, y: number) => x + (y - x) * k;
  const d = ((((b.windFrom - a.windFrom) % 360) + 540) % 360) - 180;
  return {
    rain: lerp(a.rain, b.rain),
    snow: lerp(a.snow, b.snow),
    fog: lerp(a.fog, b.fog),
    cloud: lerp(a.cloud, b.cloud),
    thunder: lerp(a.thunder, b.thunder),
    windMs: lerp(a.windMs, b.windMs),
    windFrom: (a.windFrom + d * k + 360) % 360,
    tempC: b.tempC,
    code: b.code,
  };
}

/** "Choppiness" 0–1 from wind speed (Beaufort-ish: calm < 3 m/s, rough ≥ 14 m/s). */
export function chop(c: Conditions): number {
  return clamp01((c.windMs - 3) / 11);
}
