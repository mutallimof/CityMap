import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config';
import { CALM } from './conditions';
import { WeatherController, weatherFresh } from './controller';

const MIN = 60_000;
const rainy = { current: { temperature_2m: 12, weather_code: 63, wind_speed_10m: 4, wind_direction_10m: 200, cloud_cover: 90, precipitation: 2, visibility: 8000 } };

describe('weather age', () => {
  it('fresh only within the limit (3 h), never without a fetch', () => {
    expect(CONFIG.weather.maxAgeMin).toBe(180);
    expect(weatherFresh(null, 1e12)).toBe(false);
    expect(weatherFresh(1e12, 1e12 + 179 * MIN)).toBe(true);
    expect(weatherFresh(1e12, 1e12 + 180 * MIN)).toBe(true);
    expect(weatherFresh(1e12, 1e12 + 181 * MIN)).toBe(false);
  });
});

describe('WeatherController keeps no stale weather', () => {
  let wall = 1_800_000_000_000;
  let ok = true;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('fetch', vi.fn(async () => (ok ? { ok: true, json: async () => rainy } : { ok: false })));
    wall = 1_800_000_000_000;
    ok = true;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const advance = async (ms: number) => {
    wall += ms;
    await vi.advanceTimersByTimeAsync(ms);
  };

  it('live after a fetch; after failures it turns offline once the data is over 3 h old, with a calm scene', async () => {
    const w = new WeatherController(() => wall, () => wall);
    const changes = vi.fn();
    w.onChange(changes);
    expect(w.source).toBe('offline');
    w.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.source).toBe('live');
    expect(w.target.rain).toBeGreaterThan(0);

    ok = false; // every later fetch fails
    await advance(15 * MIN * 8); // 2 h: old data still shown
    expect(w.source).toBe('live');
    expect(w.target.rain).toBeGreaterThan(0);

    await advance(15 * MIN * 5); // 3 h 15 min since the only success
    expect(w.source).toBe('offline');
    expect(w.target).toBe(CALM);
    const n = changes.mock.calls.length;
    await advance(15 * MIN * 4);
    expect(changes.mock.calls.length).toBe(n); // told the UI once

    ok = true; // back online: live again
    await advance(15 * MIN);
    expect(w.source).toBe('live');
    expect(w.target.rain).toBeGreaterThan(0);
    w.stop();
  });

  it('a first-ever failure stays offline (no chip), and never throws', async () => {
    ok = false;
    const w = new WeatherController(() => wall, () => wall);
    w.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.source).toBe('offline');
    w.stop();
  });
});
