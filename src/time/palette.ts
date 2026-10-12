/**
 * The day → golden hour → night palette blend from the sun's elevation (`themeAt`), plus colour helpers.
 * The colours come from the active look (`src/themes`); this module only decides how much of each.
 */
import { look } from '../themes';
import { CONFIG, type Palette } from '../config';

export interface Theme {
  /** 0 = full day, 1 = full night. */
  night: number;
  /** 0..1 golden-hour strength (peaks around sunrise/sunset). */
  golden: number;
  palette: Palette;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

export function mixHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

function mixPalette(a: Palette, b: Palette, t: number): Palette {
  const out = {} as Record<keyof Palette, string>;
  for (const k of Object.keys(a) as (keyof Palette)[]) out[k] = mixHex(a[k], b[k], t);
  return out;
}

/**
 * Map theme from sun elevation: day → golden hour → twilight → night, as one continuous blend
 * (no jumps when the clock is scrubbed or runs at 60×). Pure.
 */
export function themeAt(elevation: number): Theme {
  const { dayAbove, nightBelow } = CONFIG.daylight;
  const night = smooth((0 - elevation) / (0 - nightBelow)); // 0 at horizon → 1 at nightBelow
  // Golden: rises below dayAbove, peaks at the horizon, gone by nightBelow.
  const golden = elevation >= 0 ? 1 - smooth(elevation / dayAbove) : 1 - smooth(-elevation / -nightBelow);
  const { day, sunset, night: nightP } = look().colors;
  const lit = mixPalette(day, sunset, golden * 0.85);
  return { night, golden, palette: mixPalette(lit, nightP, night) };
}

/** Pull a colour towards its own grey (Rec. 601 luma) by t. */
export function desaturate(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return rgbToHex([r + (y - r) * t, g + (y - g) * t, b + (y - b) * t]);
}

/** Multiply brightness by (1 − t). */
export function darken(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([r * (1 - t), g * (1 - t), b * (1 - t)]);
}
