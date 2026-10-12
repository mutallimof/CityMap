import { look } from '../themes';
import type { Palette } from '../config';
import { darken, desaturate, mixHex } from '../time/theme';
import type { Conditions } from './conditions';

/**
 * Weather on top of the day/night base palette (sky, water, land): overcast mutes and greys the sky,
 * rain darkens it further, fog pulls everything towards the fog colour, snow whitens the land. Pure.
 */
export function weatherPalette(p: Palette, c: Conditions, night: number): Palette {
  const w = look().weather;
  const out = { ...p };
  const grey = Math.min(1, c.cloud * 0.55 + c.rain * 0.35 + c.snow * 0.2);
  if (grey > 0) {
    const sky = mixHex(w.overcastSky, w.rainSky, Math.min(1, c.rain * 1.2));
    const skyN = darken(sky, 0.82);
    const target = mixHex(sky, skyN, night);
    out.sky = mixHex(p.sky, target, grey);
    out.horizon = mixHex(p.horizon, target, grey * 0.8);
    out.fog = mixHex(p.fog, target, grey * 0.8);
    out.water = desaturate(darken(p.water, c.rain * 0.12), grey * 0.35);
    out.waterShallow = desaturate(darken(p.waterShallow, c.rain * 0.12), grey * 0.35);
    out.land = desaturate(p.land, grey * w.overcastDesat);
  }
  if (c.fog > 0) {
    const f = mixHex(w.fogColor, w.fogNight, night);
    for (const k of ['sky', 'horizon', 'fog'] as const) out[k] = mixHex(out[k], f, c.fog * 0.85);
    out.water = mixHex(out.water, f, c.fog * 0.25);
    out.waterShallow = mixHex(out.waterShallow, f, c.fog * 0.25);
  }
  if (c.snow > 0) {
    const s = mixHex(w.snowDay, w.snowNight, night);
    out.land = mixHex(out.land, s, c.snow * w.snowCover);
    out.shoreHighlight = mixHex(out.shoreHighlight, s, c.snow * 0.6);
  }
  return out;
}

/** How much the light dims under cloud / rain / fog (multiplier for sun intensity and sparkle). */
export function lightFactor(c: Conditions): number {
  return Math.max(0.35, 1 - c.cloud * 0.4 - c.rain * 0.2 - c.fog * 0.25);
}
