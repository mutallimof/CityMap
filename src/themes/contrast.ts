/** WCAG contrast helpers + the effective UI tokens of a look (pure; used by contrast.test.ts). */
import type { ThemeSpec } from './types';

export type Rgb = [number, number, number];

export function parseColor(css: string): { rgb: Rgb; a: number } {
  const s = css.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return { rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb, a: 1 };
  }
  const m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (!m) throw new Error(`unsupported colour: ${css}`);
  const p = m[1].split(',').map(Number);
  return { rgb: [p[0], p[1], p[2]], a: p[3] ?? 1 };
}

/** `fg` (with its alpha) laid over an opaque `bg`. */
export const over = (fg: { rgb: Rgb; a: number }, bg: Rgb): Rgb => fg.rgb.map((v, i) => v * fg.a + bg[i] * (1 - fg.a)) as Rgb;

const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
export const luminance = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

export function contrast(a: Rgb, b: Rgb): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Custom properties declared in a `selector { … }` block of a stylesheet. */
export function cssVars(css: string, selector: string): Record<string, string> {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no block for ${selector}`);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

/**
 * The tokens in force for a look, day or night, as the page cascades them: ui.css `:root` (+ its night block),
 * then the look's own `vars` (they win over the default night block — same specificity, later in the document),
 * then the look's `nightVars`.
 */
export function effectiveTokens(uiCss: string, t: ThemeSpec, night: boolean): Record<string, string> {
  const day = cssVars(uiCss, ':root');
  const dark = cssVars(uiCss, ":root[data-night='1']");
  return { ...day, ...(night ? dark : {}), ...t.ui.vars, ...(night ? t.ui.nightVars : {}) };
}
