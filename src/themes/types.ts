import type { CONFIG } from '../config';

/** Literal config types → plain mutable types: `as const` lists become arrays, declared tuples stay tuples. */
export type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends unknown[]
        ? { [K in keyof T]: Widen<T[K]> }
        : T extends readonly (infer U)[]
          ? Widen<U>[]
          : T extends object
          ? { -readonly [K in keyof T]: Widen<T[K]> }
          : T;

export type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

type C = typeof CONFIG;

/**
 * Structural knobs a theme can turn (beyond colours). Classic = all off / the original look.
 * Each one is read by the module that draws that part of the map.
 */
export interface ThemeStyle {
  water: {
    /** 0 = classic ripples; 1 = cartoon water: flat bands + drifting little wave marks. */
    marks: number;
    /** Wave-mark colour, size on screen (px) and density (0–1). */
    markColor: string;
    markPx: number;
    markDensity: number;
    /** 0–1: bands of colour instead of a smooth deep/shallow gradient (posterised). */
    bands: number;
    /** Light foam line hugging the coast (0–1). */
    foam: number;
    /** Watercolour pooling: water darkens towards the coast like paint gathering at an edge (0–1). */
    pool: number;
    foamColor: string;
  };
  buildings: {
    /** Draw a lighter roof cap inset from the walls: a soft outline rim and no lit windows on roofs. */
    cap: boolean;
    /** Cap thickness (m); the inset is CONFIG.city.roofInsetM (made in the building worker). */
    capM: number;
    /** Height multiplier and minimum floors (chunkier, more even blocks). */
    heightScale: number;
    minFloors: number;
    /** Corner rounding (m) of footprints (0 = sharp, classic). */
    roundM: number;
    /** 3D light strength on buildings (× the classic intensity; lower = gentler shading) and the darker-at-the-foot wall gradient. */
    light: number;
    gradient: boolean;
  };
  vapur: {
    /** 'classic' = low-poly vapur; 'toy' = rounder, chunkier toy boat. */
    model: 'classic' | 'toy';
    /** Outline around the hull and cabins, in screen px (0 = none). */
    outline: number;
    outlineColor: string;
  };
  /** Featured place pins: classic shape pins, or round bubbles with a category icon. */
  pins: 'classic' | 'bubble';
  /** Cel shading steps for 3D objects (vapurs, trees, landmarks); 0 = smooth Lambert (classic). */
  toon: number;
  /** Colours of the hero landmark models and 3D bridges. */
  models: { stone: string; stoneDark: string; pink: string; dome: string; roof: string; white: string; gold: string; window: string; rock: string; deck: string; cable: string; trunk: string };
  /** Round "lollipop" 3D trees in parks and woods when zoomed in. */
  trees3d: boolean;
  /** Hero landmarks built from primitives (Galata Tower, mosques, bridges…). */
  landmarks3d: boolean;
  /** Paper-grain overlay strength (0 = none). */
  paper: number;
  /** Glow clouds over busy areas / today's event venues (0 = none). */
  heat: number;
  /** Street glow by day too (0 = only at night, classic). */
  dayGlow: number;
  /** Map label text width of the halo (px) and its blur (px; > 0 = a soft glow). */
  labelHalo: number;
  labelBlur: number;
  /** Halo around featured pins (0 = none; classic 0.55). */
  pinGlow: number;
}

/** Everything that defines a look. Code reads it with `look()` (src/themes). */
export interface ThemeSpec {
  id: string;
  name: { tr: string; en: string };
  blurb: { tr: string; en: string };
  /** Swatches for the preview card: land, water, park, road, building, accent. */
  card: { land: string; water: string; park: string; road: string; building: string; accent: string; ink: string };
  colors: Widen<C['colors']>;
  city: Widen<Omit<C['city'], 'tiles' | 'glyphs'>>;
  shore: Widen<C['shore']>;
  piers: Widen<C['piers']>;
  routes: Widen<Pick<C['routes'], 'width' | 'opacity' | 'dash'>>;
  ferries: Widen<Pick<C['ferries'], 'shadowColor' | 'shadowOpacity'>>;
  water: Widen<Pick<C['water'], 'cityLight' | 'sparkleDay' | 'sparkleGolden'>>;
  wake: Widen<Pick<C['wake'], 'color' | 'opacity'>>;
  nightLights: Widen<C['nightLights']>;
  smoke: Widen<Pick<C['smoke'], 'color' | 'nightColor' | 'alpha' | 'dockedAlpha'>>;
  moments: Widen<Pick<C['moments'], 'hornColor' | 'burstColor'>>;
  gulls: Widen<Pick<C['gulls'], 'color' | 'factColor'>>;
  daylight: Widen<Pick<C['daylight'], 'sunDay' | 'sunGolden' | 'moon' | 'hemiSkyNight' | 'hemiGroundNight' | 'hemiNight' | 'sunNight'>>;
  light: Widen<C['light']>;
  weather: Widen<Pick<C['weather'], 'snowDay' | 'snowNight' | 'wetRoadDay' | 'wetRoadNight' | 'overcastSky' | 'rainSky' | 'fogColor' | 'fogNight' | 'snowCover' | 'wetDarken' | 'overcastDesat' | 'rainColor' | 'rainAlpha' | 'fogAlpha'>>;
  icons: Widen<Pick<C['icons'], 'colors' | 'eventGlow' | 'eventPulse' | 'storyColor'>>;
  labels: Widen<Pick<C['labels'], 'fontFamily'>> & {
    /** Map label colours (pier names, POI / featured / landmark / story names), day and night. */
    pier: string;
    pierNight: string;
    poi: string;
    poiNight: string;
    poiHalo: string;
    poiHaloNight: string;
    landmark: string;
    landmarkNight: string;
    story: string;
    storyNight: string;
    /** Font stacks (map glyphs) for place names / stories. */
    placeFont: string[];
    storyFont: string[];
  };
  guides: Widen<C['guides']>;
  plan: Widen<Pick<C['plan'], 'stopColor' | 'endColor'>>;
  style: ThemeStyle;
  ui: {
    /** CSS custom properties for the HUD (day) and their night overrides. */
    vars: Record<string, string>;
    nightVars: Record<string, string>;
    /** Extra CSS while the theme is active (scope rules with :root[data-theme='<id>']). */
    css?: string;
    /** Loads the theme's web fonts / heavy assets (lazy, only when the theme is first used). */
    assets?: () => Promise<unknown>;
  };
}
