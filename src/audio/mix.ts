import { CONFIG } from '../config';

/**
 * The city's sound mix as a pure function of what the visitor sees: time of day (sun), zoom, how much water
 * is around the view centre, and the weather. The engine (`engine.ts`) only follows these numbers.
 */

/** Long ambience beds (real recordings, ≥ 60 s each), crossfaded by level. */
export const BEDS = ['harbour', 'water', 'hum', 'street', 'rain', 'wind'] as const;
export type BedId = (typeof BEDS)[number];

export interface MixInput {
  /** 0 = full day, 1 = full night (from the real sun, `themeAt`). */
  night: number;
  zoom: number;
  /** Share of water (0..1) around the view centre. */
  water: number;
  /** Weather intensities 0..1 and wind speed (m/s), as the scene shows them. */
  rain: number;
  snow: number;
  fog: number;
  thunder: number;
  windMs: number;
}

export interface Mix {
  /** Target level 0..1 per bed (before the master volume). */
  beds: Record<BedId, number>;
  /** Low-pass cut-off over the whole mix (Hz): fog and snow muffle the city. */
  lowpassHz: number;
  /** Mean one-shot rates per minute (randomised in time and volume by the engine). */
  gullsPerMin: number;
  bellsPerMin: number;
  /** Fog signals: only in fog, mostly by the water. */
  foghornsPerMin: number;
  /** Pier creaks (a floating pier against its gangway): close in by the water. */
  piersPerMin: number;
  /** Level 0..1 for one-shots near the view centre (gulls, bell). */
  oneShotLevel: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** 0 zoomed out (city view) → 1 at street level. */
function closeness(zoom: number): number {
  const s = CONFIG.sound;
  return smooth(s.fromZoom, s.fullZoom, zoom);
}

export function mixFor(i: MixInput): Mix {
  const s = CONFIG.sound;
  const day = 1 - clamp01(i.night);
  const night = clamp01(i.night);
  const close = closeness(i.zoom);
  const far = 1 - close;
  const water = clamp01(i.water);
  const shore = close * water;
  const inland = close * (1 - water);
  const rain = clamp01(Math.max(i.rain, i.thunder * 0.7));
  const wind = smooth(s.windFromMs, s.windFullMs, i.windMs);
  const snow = clamp01(i.snow);
  // Heavy weather and snow push the city back: fewer people out, the hiss of rain on top.
  const city = (1 - 0.45 * rain) * (1 - s.snowQuiet * snow) * (1 - 0.3 * wind);
  const beds: Record<BedId, number> = {
    // Busy waterfront (people, gulls, boats) by day; a little of it carries over the water zoomed out.
    harbour: day * (shore + far * 0.12) * city,
    // Quiet lapping water: the night shore, and under the day harbour close in.
    water: (shore * (0.3 + 0.7 * night) + far * 0.1 * night) * (1 - 0.4 * rain) * (1 - 0.3 * snow),
    // Distant city hum: the zoomed-out sound, and the background inland and at night.
    hum: (far * 0.85 + close * (0.2 + 0.25 * night)) * (0.75 + 0.25 * night) * city,
    // Street / café: inland close in, mostly by day.
    street: inland * (day + 0.3 * night) * city,
    rain: rain * (0.55 + 0.45 * close),
    wind: wind * (0.6 + 0.4 * close),
  };
  for (const b of BEDS) beds[b] = clamp01(beds[b] * s.beds[b]);
  const muffle = Math.max(clamp01(i.fog), snow * 0.7);
  const lowpassHz = s.openHz * (s.mutedHz / s.openHz) ** muffle;
  const quiet = (1 - 0.8 * rain) * (1 - 0.8 * snow) * (1 - 0.6 * wind);
  return {
    beds,
    lowpassHz,
    gullsPerMin: s.gullsPerMin * (day + 0.12 * night) * (0.15 + 0.85 * water) * (0.25 + 0.75 * close) * quiet,
    bellsPerMin: s.bellsPerMin * close * (0.4 + 0.6 * water) * (1 - 0.6 * rain),
    foghornsPerMin: s.foghornsPerMin * smooth(0.3, 0.8, i.fog) * (0.3 + 0.7 * water),
    piersPerMin: s.piersPerMin * shore * shore * (1 - 0.5 * rain),
    oneShotLevel: 0.3 + 0.7 * close,
  };
}

/** Seconds to the next one-shot of a Poisson stream at `perMin` (`u` uniform 0..1), never sooner than `minS`. */
export function nextGapS(perMin: number, u: number, minS: number): number {
  if (perMin <= 0) return Infinity;
  return Math.max(minS, (-Math.log(1 - Math.min(0.999999, u)) * 60) / perMin);
}

/**
 * Ferry horns: only for real (timetabled) departures, only from piers near the view, and never more than
 * one every `hornGapS` seconds. Returns the horn's level 0..1, or 0 for no horn.
 */
export class HornGate {
  private last = -Infinity;

  /** `distM` = departure to view centre; `nowS` = real seconds (monotonic). */
  level(real: boolean, distM: number, zoom: number, nowS: number): number {
    const s = CONFIG.sound;
    if (!real || nowS - this.last < s.hornGapS) return 0;
    const reach = s.hearM * 2 ** (13 - zoom);
    const near = 1 - distM / reach;
    if (near <= 0) return 0;
    this.last = nowS;
    return near * (0.35 + 0.65 * closeness(zoom));
  }
}

/** Metres between two lng/lat points (equirectangular; fine at city scale). */
export function distM(a: [number, number], b: [number, number]): number {
  const kx = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * 111_320 * kx, (a[1] - b[1]) * 110_540);
}

/** Radius (m) around the view centre that counts as "here" for the water share: wider zoomed out. */
export function hearRadiusM(zoom: number): number {
  return Math.max(120, Math.min(4000, CONFIG.sound.hereM * 2 ** (16 - zoom)));
}
