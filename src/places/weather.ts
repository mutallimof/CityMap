import { CONFIG } from '../config';

export interface Weather {
  temperature: number;
  code: number;
  windKmh: number;
  /** Direction the wind comes FROM (meteorological, degrees). */
  windFrom: number;
}

/** Open-Meteo current conditions (free, no key). Null if offline / blocked. */
export async function fetchWeather(): Promise<Weather | null> {
  try {
    const res = await fetch(CONFIG.weather.url);
    if (!res.ok) return null;
    const j = (await res.json()) as { current?: { temperature_2m: number; weather_code: number; wind_speed_10m: number; wind_direction_10m: number } };
    const c = j.current;
    if (!c) return null;
    return { temperature: c.temperature_2m, code: c.weather_code, windKmh: c.wind_speed_10m, windFrom: c.wind_direction_10m };
  } catch {
    return null;
  }
}

/** WMO weather code → icon (day/night). */
export function weatherIcon(code: number, night: boolean): string {
  if (code === 0) return night ? '☾' : '☀️';
  if (code <= 2) return night ? '☁️' : '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫';
  if (code >= 51 && code <= 67) return '🌧';
  if (code >= 71 && code <= 77) return '🌨';
  if (code >= 80 && code <= 82) return '🌦';
  if (code >= 95) return '⛈';
  return '🌤';
}
