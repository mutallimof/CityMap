import type { Map as MlMap } from 'maplibre-gl';
import { CONFIG, type Palette } from '../config';
import { LAYER } from '../map/style';
import { sunPosition } from '../time/sun';
import { mixHex, themeAt, type Theme } from '../time/theme';
import type { WaterLayer } from '../water/water-layer';
import type { VapurLayer } from '../ferries/vapur-layer';
import type { ClockController } from './clock';

export interface DaylightTargets {
  map: MlMap;
  water: WaterLayer;
  ferries: VapurLayer;
  clock: ClockController;
}

/**
 * Drives everything that depends on the sun: map palette, sky, water, 3D lighting, night lights,
 * label colours. Sun position comes from the *simulated* Istanbul time, so scrubbing to 19:00
 * shows the real sunset. Updates a few times per second; the map style only when it changed.
 */
export class DaylightController {
  private applied: Palette | null = null;
  private timer = 0;
  theme: Theme = themeAt(45);
  sun = { azimuth: 180, elevation: 45 };
  private listeners = new Set<() => void>();

  constructor(private t: DaylightTargets) {}

  start(): void {
    const tick = () => {
      this.update();
      this.timer = window.setTimeout(tick, 250);
    };
    tick();
  }

  stop(): void {
    clearTimeout(this.timer);
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  update(): void {
    const [lon, lat] = CONFIG.camera.center;
    const sun = sunPosition(this.t.clock.now(), lat, lon);
    const theme = themeAt(sun.elevation);
    const changed = Math.abs(theme.night - this.theme.night) > 0.001 || Math.abs(theme.golden - this.theme.golden) > 0.001;
    this.sun = sun;
    this.theme = theme;
    this.applyMap(theme.palette);
    const d = CONFIG.daylight;
    const sunColor = mixHex(d.sunDay, d.sunGolden, theme.golden);
    this.t.water.set({
      deep: theme.palette.water,
      shallow: theme.palette.waterShallow,
      night: theme.night,
      sparkle: (CONFIG.water.sparkleDay + (CONFIG.water.sparkleGolden - CONFIG.water.sparkleDay) * theme.golden) * (1 - theme.night),
      sunColor: theme.night > 0.6 ? d.moon : sunColor,
      sunAzimuth: theme.night > 0.6 ? (sun.azimuth + 180) % 360 : sun.azimuth,
    });
    const l = CONFIG.light;
    this.t.ferries.setLighting({
      sunAzimuth: theme.night > 0.6 ? (sun.azimuth + 180) % 360 : sun.azimuth,
      sunElevation: sun.elevation,
      sunColor: mixHex(sunColor, d.moon, theme.night),
      sunIntensity: l.sunIntensity + (d.sunNight - l.sunIntensity) * theme.night,
      sky: mixHex(l.sky, d.hemiSkyNight, theme.night),
      ground: mixHex(l.ground, d.hemiGroundNight, theme.night),
      hemiIntensity: l.hemiIntensity + (d.hemiNight - l.hemiIntensity) * theme.night,
      night: theme.night,
    });
    const root = document.documentElement;
    root.style.setProperty('--label-text', mixHex(CONFIG.colors.labelText, CONFIG.colors.labelTextNight, theme.night));
    root.style.setProperty('--label-halo', mixHex(CONFIG.colors.labelHaloHex, CONFIG.colors.labelHaloNight, theme.night) + 'D9');
    root.style.setProperty('--water', theme.palette.water);
    root.dataset.night = theme.night > 0.5 ? '1' : '0';
    if (changed) for (const fn of this.listeners) fn();
  }

  private applyMap(p: Palette): void {
    const a = this.applied;
    const map = this.t.map;
    if (a && (Object.keys(p) as (keyof Palette)[]).every((k) => a[k] === p[k])) return;
    map.setPaintProperty('water', 'background-color', p.water);
    map.setPaintProperty(LAYER.land, 'fill-color', p.land);
    map.setPaintProperty(LAYER.shoreHighlight, 'line-color', p.shoreHighlight);
    map.setPaintProperty(LAYER.innerShadow, 'line-color', p.landInnerShadow);
    map.setSky({ 'sky-color': p.sky, 'horizon-color': p.horizon, 'fog-color': p.fog });
    this.applied = p;
  }
}
