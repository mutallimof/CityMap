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

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
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
  const { day, sunset, night: nightP } = CONFIG.colors;
  const lit = mixPalette(day, sunset, golden * 0.85);
  return { night, golden, palette: mixPalette(lit, nightP, night) };
}
