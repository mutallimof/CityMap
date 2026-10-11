import type { ExpressionSpecification, GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection, MultiLineString, Point } from 'geojson';
import { CONFIG } from '../config';
import type { LandmarkProps } from '../data/load';
import type { Story } from '../stories/stories';

const SRC = { bridges: 'skyline-bridges', towers: 'skyline-towers', lit: 'skyline-lit' } as const;
const L = { bridgeGlow: 'skyline-bridge-glow', bridge: 'skyline-bridge', towerHalo: 'skyline-tower-halo', towerCore: 'skyline-tower-core', lit: 'skyline-lit' } as const;

/** Bosphorus suspension bridges carry LED light shows; the Golden Horn bridges don't. */
const SHOW_BRIDGES = ['bosphorus-bridge', 'fsm-bridge', 'yss-bridge'];
const LIT_KINDS = ['mosque', 'palace', 'tower', 'fortress', 'church', 'synagogue'];

const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(((h % 360) + 360) % 360)}, ${s}%, ${l}%)`;

/**
 * Night skyline (test mode, `?skyline=1`): light shows on the Bosphorus bridges (colour bands
 * running along the deck), a glowing Maiden's Tower, softly lit minarets and landmarks. Fades in
 * with the night; reduce-motion = slow, steady colour changes. Cheap: a few GeoJSON layers and one
 * line-gradient update ~15×/s.
 */
export class Skyline {
  private raf = 0;
  private lastPaint = 0;
  private night = 0;

  constructor(
    private map: MlMap,
    landmarks: FeatureCollection<Point | MultiLineString, LandmarkProps>,
    private reduced: boolean,
    private nightNow: () => number,
  ) {
    const c = CONFIG.skyline;
    const before = map.getLayer('poi') ? 'poi' : undefined;
    const bridges = landmarks.features.filter((f) => f.properties.kind === 'bridge-line' && SHOW_BRIDGES.includes(f.properties.id));
    const towers = landmarks.features.filter((f) => f.properties.kind === 'tower');
    map.addSource(SRC.bridges, { type: 'geojson', data: { type: 'FeatureCollection', features: bridges }, lineMetrics: true });
    map.addSource(SRC.towers, { type: 'geojson', data: { type: 'FeatureCollection', features: towers } });
    map.addSource(SRC.lit, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const z = (stops: [number, number][]) => ['interpolate', ['exponential', 1.6], ['zoom'], ...stops.flat()] as unknown as ExpressionSpecification;
    map.addLayer(
      {
        id: L.lit,
        type: 'circle',
        source: SRC.lit,
        minzoom: 11.5,
        paint: { 'circle-color': c.litColor, 'circle-radius': z([[11.5, 3], [14, 9], [17, 26]]), 'circle-blur': 1, 'circle-opacity': 0 },
      },
      before,
    );
    map.addLayer(
      {
        id: L.bridgeGlow,
        type: 'line',
        source: SRC.bridges,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-width': z([[10, 8], [13, 22], [16, 60]]), 'line-blur': z([[10, 6], [13, 16], [16, 44]]), 'line-opacity': 0, 'line-gradient': this.gradient(0) },
      },
      before,
    );
    map.addLayer(
      {
        id: L.bridge,
        type: 'line',
        source: SRC.bridges,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-width': z([[10, 2.2], [13, 4.5], [16, 10]]), 'line-opacity': 0, 'line-gradient': this.gradient(0) },
      },
      before,
    );
    map.addLayer(
      {
        id: L.towerHalo,
        type: 'circle',
        source: SRC.towers,
        paint: { 'circle-color': c.towerColor, 'circle-radius': z([[10, 10], [13, 34], [16, 110]]), 'circle-blur': 1, 'circle-opacity': 0 },
      },
      before,
    );
    map.addLayer(
      {
        id: L.towerCore,
        type: 'circle',
        source: SRC.towers,
        paint: { 'circle-color': '#FFF6DE', 'circle-radius': z([[10, 2], [13, 5], [16, 14]]), 'circle-blur': 0.6, 'circle-opacity': 0 },
      },
      before,
    );
    this.loop();
  }

  /** Mosques (minarets), palaces, towers, fortresses from the stories get a soft warm glow. */
  setStories(list: Story[]): void {
    const features = list
      .filter((s) => LIT_KINDS.includes(s.kind))
      .map((s) => ({ type: 'Feature' as const, properties: { kind: s.kind, seed: (s.osm.length * 7919 + Number(s.osm.replace(/\D/g, '').slice(-4))) % 1000 }, geometry: { type: 'Point' as const, coordinates: s.lngLat } }));
    (this.map.getSource(SRC.lit) as GeoJSONSource).setData({ type: 'FeatureCollection', features });
  }

  /** Colour stops along the deck for the current moment of the show. */
  private gradient(t: number): ExpressionSpecification {
    const shows = CONFIG.skyline.showS;
    const phase = Math.floor(t / shows) % 3;
    const u = (t % shows) / shows;
    const stops: (number | string)[] = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const x = i / N;
      let col: string;
      if (phase === 0) col = hsl(x * 300 - t * 60, 90, 62); // rainbow sweep
      else if (phase === 1) col = Math.floor(x * 6 - t * 2.2) % 2 === 0 ? '#E8343F' : '#FFF4F0'; // red-white chase
      else col = hsl(200 + 140 * Math.sin(u * Math.PI * 2), 85, 52 + 18 * Math.sin(x * Math.PI * 4 + t * 3)); // slow pulse
      stops.push(x, col);
    }
    return ['interpolate', ['linear'], ['line-progress'], ...stops] as unknown as ExpressionSpecification;
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (now - this.lastPaint < (this.reduced ? 4000 : 66)) return;
    this.lastPaint = now;
    const n = Math.max(0, Math.min(1, (this.nightNow() - 0.3) / 0.5));
    const map = this.map;
    if (n === 0 && this.night === 0) return;
    this.night = n;
    const t = now / 1000;
    if (n > 0) {
      const g = this.gradient(this.reduced ? Math.floor(t / 4) * 4 : t);
      map.setPaintProperty(L.bridge, 'line-gradient', g);
      map.setPaintProperty(L.bridgeGlow, 'line-gradient', g);
    }
    const breathe = this.reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 0.9);
    map.setPaintProperty(L.bridge, 'line-opacity', 0.95 * n);
    map.setPaintProperty(L.bridgeGlow, 'line-opacity', 0.65 * n);
    map.setPaintProperty(L.towerHalo, 'circle-opacity', ['match', ['get', 'id'], 'maidens-tower', 0.75 * n * breathe, 0.4 * n] as unknown as ExpressionSpecification);
    map.setPaintProperty(L.towerCore, 'circle-opacity', 0.9 * n);
    map.setPaintProperty(L.lit, 'circle-opacity', 0.55 * n);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
  }
}
