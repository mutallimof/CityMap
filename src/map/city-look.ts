import { CONFIG } from '../config';
import { darken, desaturate, mixHex } from '../time/theme';
import type { Season } from '../weather/conditions';

type Day = (typeof CONFIG.city)['day'];
/** Every colour the city layers use (strings or string lists). */
export type CityPalette = { -readonly [K in keyof Day]: Day[K] extends readonly string[] ? string[] : string } & { blossom: string[] };

export interface CityLookInput {
  night: number;
  golden: number;
  season: Season;
  /** 0–1 */
  wet: number;
  snow: number;
  cloud: number;
}

const GROUND = ['residential', 'commercial', 'industrial', 'institutional', 'hospital', 'cemetery', 'pitch', 'grass', 'park', 'wood', 'sand', 'farmland', 'wetland'] as const;
const ROADS = ['road', 'roadMajor', 'path', 'rail', 'roadCasing', 'roadMajorCasing'] as const;
/** Keys that keep their colour regardless of overcast / golden tint (lights, labels). */
const KEEP = new Set(['landmark', 'bridge', 'streetLabel', 'streetHalo']);

function mapPalette(p: CityPalette, fn: (key: string, c: string) => string): CityPalette {
  const out = {} as Record<string, string | string[]>;
  for (const [k, v] of Object.entries(p)) out[k] = Array.isArray(v) ? v.map((c) => fn(k, c)) : fn(k, v as string);
  return out as CityPalette;
}

function base(which: 'day' | 'night'): CityPalette {
  const src = CONFIG.city[which];
  const out = {} as Record<string, string | string[]>;
  for (const [k, v] of Object.entries(src)) out[k] = Array.isArray(v) ? [...v] : (v as string);
  out.blossom = [];
  return out as CityPalette;
}

/**
 * City colours for a moment: day palette with seasonal vegetation and a golden-hour cast, blended to
 * night; then weather — snow whitens ground and roofs, rain darkens and cools roads ("wet streets"),
 * overcast mutes everything a little. Pure.
 */
export function cityLook(i: CityLookInput): CityPalette {
  const w = CONFIG.weather;
  const s = CONFIG.city.seasons[i.season];
  let day = base('day');
  day.grass = s.grass;
  day.park = s.park;
  day.wood = s.wood;
  day.cemetery = mixHex(day.cemetery, s.grass, 0.5);
  day.pitch = mixHex(day.pitch, s.grass, 0.3);
  day.blossom = [...s.blossom];
  day = mapPalette(day, (k, c) => (KEEP.has(k) || k === 'blossom' ? c : mixHex(c, CONFIG.city.goldenTint, i.golden * CONFIG.city.goldenTintAmount)));

  const night = base('night');
  night.blossom = day.blossom.map((c) => mixHex(c, '#20283A', 0.7));
  let p = mapPalette(day, (k, c) => {
    const n = (night as Record<string, string | string[]>)[k];
    if (Array.isArray(n)) {
      const list = (day as Record<string, string | string[]>)[k] as string[];
      return mixHex(c, n[list.indexOf(c) % n.length] ?? n[0], i.night);
    }
    return mixHex(c, n ?? c, i.night);
  });

  if (i.snow > 0) {
    const snowC = mixHex(w.snowDay, w.snowNight, i.night);
    const cover = i.snow * w.snowCover;
    p = mapPalette(p, (k, c) => {
      if ((GROUND as readonly string[]).includes(k) || k === 'buildings') return mixHex(c, snowC, k === 'wood' ? cover * 0.6 : cover);
      if ((ROADS as readonly string[]).includes(k)) return mixHex(c, snowC, cover * 0.45);
      if (k === 'blossom') return mixHex(c, snowC, cover);
      return c;
    });
  }
  if (i.wet > 0) {
    const wetC = mixHex(w.wetRoadDay, w.wetRoadNight, i.night);
    p = mapPalette(p, (k, c) => {
      if (k === 'road' || k === 'path') return mixHex(c, wetC, i.wet * 0.55);
      if (k === 'roadMajor') return mixHex(c, darken(c, 0.2), i.wet * 0.6);
      if ((GROUND as readonly string[]).includes(k) || k === 'buildings') return darken(c, i.wet * w.wetDarken);
      return c;
    });
  }
  if (i.cloud > 0) p = mapPalette(p, (k, c) => (KEEP.has(k) ? c : desaturate(c, i.cloud * w.overcastDesat * (1 - i.night * 0.5))));
  return p;
}
