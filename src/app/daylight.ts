import type { Map as MlMap } from 'maplibre-gl';
import { CONFIG, type Palette } from '../config';
import { LAYER } from '../map/style';
import { sunPosition } from '../time/sun';
import { mixHex, themeAt, type Theme } from '../time/theme';
import type { WaterLayer } from '../water/water-layer';
import type { VapurLayer } from '../ferries/vapur-layer';
import type { ClockController } from './clock';
import type { CityLook } from '../map/city';
import { cityLook } from '../map/city-look';
import type { WeatherController } from '../weather/controller';
import type { WeatherLayer } from '../weather/weather-layer';
import { chop, type Conditions, type Season } from '../weather/conditions';
import { lightFactor, weatherPalette } from '../weather/look';

export interface DaylightTargets {
  map: MlMap;
  water: WaterLayer;
  ferries: VapurLayer;
  clock: ClockController;
  city: CityLook;
  weather: WeatherController;
  weatherLayer: WeatherLayer;
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
  conditions: Conditions;
  season: Season;
  private last = performance.now();
  private listeners = new Set<() => void>();

  constructor(private t: DaylightTargets) {
    this.conditions = t.weather.current;
    this.season = t.weather.season();
  }

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
    const now = performance.now();
    const c = this.t.weather.step(Math.min(2, (now - this.last) / 1000));
    this.last = now;
    const season = this.t.weather.season();
    const changed =
      Math.abs(theme.night - this.theme.night) > 0.001 ||
      Math.abs(theme.golden - this.theme.golden) > 0.001 ||
      season !== this.season ||
      Math.abs(c.rain - this.conditions.rain) + Math.abs(c.snow - this.conditions.snow) + Math.abs(c.fog - this.conditions.fog) + Math.abs(c.cloud - this.conditions.cloud) > 0.004;
    this.sun = sun;
    this.theme = theme;
    this.conditions = c;
    this.season = season;
    // Overcast skies soften the golden hour too.
    const golden = theme.golden * (1 - c.cloud * 0.6);
    const palette = weatherPalette(theme.palette, c, theme.night);
    this.applyMap(palette);
    this.t.city.apply(cityLook({ night: theme.night, golden, season, wet: c.rain, snow: c.snow, cloud: c.cloud }), theme.night, season === 'spring');
    const d = CONFIG.daylight;
    const lf = lightFactor(c);
    const sunColor = mixHex(d.sunDay, d.sunGolden, golden);
    const sea = chop(c);
    this.t.water.set({
      deep: palette.water,
      shallow: palette.waterShallow,
      night: theme.night,
      sparkle: (CONFIG.water.sparkleDay + (CONFIG.water.sparkleGolden - CONFIG.water.sparkleDay) * golden) * (1 - theme.night) * lf * lf,
      sunColor: theme.night > 0.6 ? d.moon : sunColor,
      sunAzimuth: theme.night > 0.6 ? (sun.azimuth + 180) % 360 : sun.azimuth,
      rain: c.rain,
      chop: sea,
    });
    const l = CONFIG.light;
    const sunAz = theme.night > 0.6 ? (sun.azimuth + 180) % 360 : sun.azimuth;
    this.t.ferries.setLighting({
      sunAzimuth: sunAz,
      sunElevation: sun.elevation,
      sunColor: mixHex(sunColor, d.moon, theme.night),
      sunIntensity: (l.sunIntensity + (d.sunNight - l.sunIntensity) * theme.night) * lf,
      sky: mixHex(l.sky, d.hemiSkyNight, theme.night),
      ground: mixHex(l.ground, d.hemiGroundNight, theme.night),
      hemiIntensity: l.hemiIntensity + (d.hemiNight - l.hemiIntensity) * theme.night,
      night: theme.night,
    });
    // Wind steers the funnel smoke and rocks the boats; fog dims their lights.
    const f = this.t.ferries;
    f.wind = { toward: (c.windFrom + 180) % 360, ms: Math.max(0.5, Math.min(12, c.windMs)) };
    f.sea = sea;
    f.fog = c.fog;
    this.t.weatherLayer.set({ rain: c.rain, snow: c.snow, fog: c.fog, thunder: c.thunder, windToward: (c.windFrom + 180) % 360, windMs: c.windMs, night: theme.night });
    // 3D buildings: light from the sun (or moon), softer under cloud.
    // Night: a pale, nearly neutral light so facades keep their value (a blue moon tint muddies them).
    this.applyLight(sunAz, sun.elevation, mixHex(mixHex(sunColor, '#FFFFFF', 0.4), CONFIG.city.lights.moonLight, theme.night), (0.4 - theme.night * 0.18) * (0.75 + 0.25 * lf));
    const root0 = document.documentElement;
    root0.dataset.season = season;
    root0.dataset.weather = c.rain > 0.3 ? 'rain' : c.snow > 0.3 ? 'snow' : c.fog > 0.3 ? 'fog' : 'clear';
    root0.classList.toggle('season-spring', season === 'spring');
    const root = document.documentElement;
    root.style.setProperty('--label-text', mixHex(CONFIG.colors.labelText, CONFIG.colors.labelTextNight, theme.night));
    root.style.setProperty('--label-halo', mixHex(CONFIG.colors.labelHaloHex, CONFIG.colors.labelHaloNight, theme.night) + 'D9');
    root.style.setProperty('--water', theme.palette.water);
    root.dataset.night = theme.night > 0.5 ? '1' : '0';
    if (changed) for (const fn of this.listeners) fn();
  }

  private lightKey = '';
  private applyLight(azimuth: number, elevation: number, color: string, intensity: number): void {
    // MapLibre light: [radial, azimuthal (° clockwise from north), polar (° from zenith)].
    const polar = Math.round(Math.max(20, Math.min(80, 90 - Math.max(elevation, 10))));
    const az = Math.round(azimuth / 5) * 5;
    const key = `${az}|${polar}|${color}|${intensity.toFixed(2)}`;
    if (key === this.lightKey) return;
    this.lightKey = key;
    this.t.map.setLight({ anchor: 'map', position: [1.2, az, polar], color, intensity: Number(intensity.toFixed(2)) });
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
