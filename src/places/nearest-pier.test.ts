import { readFileSync } from 'node:fs';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import { makeLandIndex } from '../plan/land';
import { nearestPierOnLand, onPierLand } from './nearest-pier';

type LngLat = [number, number];
const json = <T,>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const land = makeLandIndex(json<FeatureCollection<Polygon | MultiPolygon>>('data/land.geojson'));
const landOf = (p: LngLat, s: number) => land.landOf(p, s);
const served = new Set(json<{ lines: { stops: string[] }[] }>('data/lines.json').lines.flatMap((l) => l.stops));
const piers = json<{ features: { properties: { id: string }; geometry: { coordinates: LngLat } }[] }>('data/piers.geojson')
  .features.filter((f) => served.has(f.properties.id))
  .map((f) => ({ id: f.properties.id, lngLat: f.geometry.coordinates }));
const pier = (id: string) => piers.find((p) => p.id === id)!.lngLat;
// Real places (coordinates from the shipped OSM-derived data, never typed).
type Feat = { properties: { id: string; district: string | null }; geometry: { coordinates: LngLat } };
const feats = [...json<{ features: Feat[] }>('data/places.geojson').features, ...json<{ features: Feat[] }>('data/places-auto.geojson').features];
const place = (id: string) => {
  const f = feats.find((x) => x.properties.id === id);
  if (!f) throw new Error(`no place ${id}`);
  return f.geometry.coordinates;
};
const near = (p: LngLat) => nearestPierOnLand(p, piers, landOf);
const ASIA = ['uskudar', 'kadikoy', 'bostanci', 'kanlica', 'anadolu-hisari', 'cengelkoy', 'beylerbeyi', 'anadolu-kavagi', 'beykoz', 'pasabahce', 'cubuklu'];

describe('nearest pier on the same landmass', () => {
  it('a Kadıköy place gets a Kadıköy pier', () => {
    expect(near(place('sinematek-w1087432624')).id).toMatch(/^kadikoy/);
  });

  it('a Beşiktaş place never gets an Üsküdar (or any Asian-side) pier', () => {
    expect(near(place('ihlamur-kasirlari-w24805007')).id).not.toMatch(/^uskudar/);
    const besiktas = feats.filter((f) => f.properties.district === 'Beşiktaş');
    expect(besiktas.length).toBeGreaterThan(5);
    for (const f of besiktas) {
      const id = near(f.geometry.coordinates).id;
      expect(id, f.properties.id).not.toBe('');
      expect(ASIA.some((a) => id.startsWith(a)), `${f.properties.id} → ${id}`).toBe(false);
    }
  });

  it('places across the Bosphorus from their straight-line nearest pier get one on their own shore', () => {
    expect(near(place('rumeli-hisari-r7318154')).id).toBe('bebek'); // straight line: Anadolu Hisarı
    expect(near(place('ekmek-teknesi-n13115766701')).id).toMatch(/^uskudar/); // Kuzguncuk; straight line: Ortaköy
    expect(nearestPierOnLand(place('rumeli-hisari-r7318154'), piers).id).toBe('anadolu-hisari'); // no land data: plain distance
  });

  it('island places get their island pier', () => {
    expect(near(place('d-orient-buyukada-n9897855978')).id).toBe('buyukada');
    expect(near(place('sait-faik-abasiyanik-museum-n9967219116')).id).toBe('burgazada');
  });

  it('an islet off the coastline (Kız Kulesi) and a point on open water get no pier, without throwing', () => {
    expect(near(place('kiz-kulesi'))).toEqual({ id: '', distance: Infinity });
    const a = pier('besiktas');
    const b = pier('uskudar');
    const mid: LngLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    expect(land.landOf(mid, 100)).toBeNull();
    expect(near(mid)).toEqual({ id: '', distance: Infinity });
  });

  it('pier sheet "Nearby": a place is on its pier\'s landmass, not across the water', () => {
    expect(onPierLand(pier('bebek'), place('rumeli-hisari-r7318154'), piers, landOf)).toBe(true);
    expect(onPierLand(pier('anadolu-hisari'), place('rumeli-hisari-r7318154'), piers, landOf)).toBe(false);
    expect(onPierLand(pier('besiktas'), place('kiz-kulesi'), piers, landOf)).toBe(false);
  });
});
