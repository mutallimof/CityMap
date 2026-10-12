import { CONFIG } from '../config';
import type { ThemeSpec, Widen } from './types';

/** Deep, mutable copy of a config value (themes never share arrays / objects with CONFIG). */
const copy = <T>(x: T): Widen<T> => JSON.parse(JSON.stringify(x)) as Widen<T>;

/**
 * Classic: the original look of the map — every value comes straight from CONFIG (src/config.ts), so
 * the Classic theme is the pre-theme map, unchanged.
 */
const { tiles: _t, glyphs: _g, ...city } = CONFIG.city;
const c = CONFIG.colors;

export const classic: ThemeSpec = {
  id: 'classic',
  name: { tr: 'Klasik', en: 'Classic' },
  blurb: { tr: 'Sakin pastel şehir, gerçekçi vapurlar', en: 'Calm pastel city, realistic vapurs' },
  card: { land: c.day.land, water: c.day.water, park: CONFIG.city.day.park, road: CONFIG.city.day.roadMajor, building: CONFIG.city.day.buildings[0], accent: c.accentGold, ink: c.labelText },
  colors: copy(CONFIG.colors),
  city: copy(city),
  shore: copy(CONFIG.shore),
  piers: copy(CONFIG.piers),
  routes: { width: [...CONFIG.routes.width], opacity: CONFIG.routes.opacity, dash: [...CONFIG.routes.dash] },
  ferries: { shadowColor: CONFIG.ferries.shadowColor, shadowOpacity: CONFIG.ferries.shadowOpacity },
  water: { cityLight: CONFIG.water.cityLight, sparkleDay: CONFIG.water.sparkleDay, sparkleGolden: CONFIG.water.sparkleGolden },
  wake: { color: CONFIG.wake.color, opacity: CONFIG.wake.opacity },
  nightLights: copy(CONFIG.nightLights),
  smoke: { color: CONFIG.smoke.color, nightColor: CONFIG.smoke.nightColor, alpha: CONFIG.smoke.alpha, dockedAlpha: CONFIG.smoke.dockedAlpha },
  moments: { hornColor: CONFIG.moments.hornColor, burstColor: CONFIG.moments.burstColor },
  gulls: { color: CONFIG.gulls.color, factColor: CONFIG.gulls.factColor },
  daylight: (({ sunDay, sunGolden, moon, hemiSkyNight, hemiGroundNight, hemiNight, sunNight }) => ({ sunDay, sunGolden, moon, hemiSkyNight, hemiGroundNight, hemiNight, sunNight }))(CONFIG.daylight),
  light: copy(CONFIG.light),
  weather: (({ snowDay, snowNight, wetRoadDay, wetRoadNight, overcastSky, rainSky, fogColor, fogNight, snowCover, wetDarken, overcastDesat, rainColor, rainAlpha, fogAlpha }) => ({ snowDay, snowNight, wetRoadDay, wetRoadNight, overcastSky, rainSky, fogColor, fogNight, snowCover, wetDarken, overcastDesat, rainColor, rainAlpha, fogAlpha }))(CONFIG.weather),
  icons: { colors: copy(CONFIG.icons.colors), eventGlow: CONFIG.icons.eventGlow, eventPulse: CONFIG.icons.eventPulse, storyColor: CONFIG.icons.storyColor },
  labels: {
    fontFamily: CONFIG.labels.fontFamily,
    pier: '#1F5E6E',
    pierNight: '#9FD3DE',
    poi: '#4A3D30',
    poiNight: '#ECE4D6',
    poiHalo: 'rgba(255,250,242,0.95)',
    poiHaloNight: 'rgba(18,22,30,0.92)',
    landmark: '#8A6410',
    landmarkNight: '#F3CB6B',
    story: '#7A5A12',
    storyNight: '#F0CC7A',
    placeFont: [...CONFIG.city.fontBold],
    storyFont: ['Noto Sans Italic'],
  },
  guides: copy(CONFIG.guides),
  plan: { stopColor: CONFIG.plan.stopColor, endColor: CONFIG.plan.endColor },
  style: {
    water: { marks: 0, markColor: '#FFFFFF', markPx: 14, markDensity: 0, bands: 0, foam: 0, pool: 0, foamColor: '#FFFFFF' },
    buildings: { cap: false, capM: 0, heightScale: 1, minFloors: 0, roundM: 0, light: 1, gradient: true },
    vapur: { model: 'classic', outline: 0, outlineColor: '#000000' },
    toon: 0,
    models: { stone: '#EBDDC4', stoneDark: '#C9B89A', pink: '#E9B9A6', dome: '#8C9AAE', roof: '#7E8FA6', white: '#F7F4EC', gold: '#E0A100', window: '#34404C', rock: '#B9AA90', deck: '#D8C9B0', cable: '#5A4B3A', trunk: '#8A6A4A' },
    pins: 'classic',
    trees3d: false,
    landmarks3d: false,
    paper: 0,
    heat: 0,
    dayGlow: 0,
    labelHalo: 1.6,
  },
  // The HUD's original tokens live in src/ui/ui.css (:root); Classic changes nothing.
  ui: { vars: {}, nightVars: {} },
};
