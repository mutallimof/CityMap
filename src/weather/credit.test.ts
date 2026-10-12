import { describe, expect, it, vi } from 'vitest';
import { WEATHER_CREDIT, showWeatherCredit } from './credit';

function fakeMap() {
  const sources = new Map<string, { attribution?: string }>();
  const layers: string[] = [];
  return {
    sources,
    layers,
    isStyleLoaded: () => true,
    once: vi.fn(),
    getSource: (id: string) => sources.get(id),
    addSource: (id: string, s: { attribution?: string }) => sources.set(id, s),
    addLayer: (l: { id: string }) => layers.push(l.id),
    removeLayer: (id: string) => layers.splice(layers.indexOf(id), 1),
    removeSource: (id: string) => sources.delete(id),
  };
}

describe('Open-Meteo credit', () => {
  it('says "Weather data by Open-Meteo.com" linked to open-meteo.com', () => {
    expect(WEATHER_CREDIT).toContain('Weather data by Open-Meteo.com');
    expect(WEATHER_CREDIT).toContain('href="https://open-meteo.com/"');
  });
  it('adds one attribution source (once) and removes it', () => {
    const m = fakeMap();
    showWeatherCredit(m as never, true);
    showWeatherCredit(m as never, true);
    expect([...m.sources.values()].map((s) => s.attribution)).toEqual([WEATHER_CREDIT]);
    expect(m.layers).toHaveLength(1);
    showWeatherCredit(m as never, false);
    expect(m.sources.size).toBe(0);
  });
});
