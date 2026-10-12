/**
 * The active theme in the page: `data-theme` on <html>, the theme's CSS tokens (day + night) and extra
 * CSS in one <style>, its fonts loaded lazily — and the soft fade used when switching live.
 */
import type { ThemeSpec } from './types';

const STYLE_ID = 'theme-tokens';
const loaded = new Set<string>();

const block = (sel: string, vars: Record<string, string>) => {
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return body ? `${sel} {\n${body}\n}\n` : '';
};

/** CSS text for a theme's tokens (pure, tested). */
export function themeCss(t: ThemeSpec): string {
  const root = `:root[data-theme='${t.id}']`;
  return block(root, t.ui.vars) + block(`${root}[data-night='1']`, t.ui.nightVars) + (t.ui.css ?? '');
}

/** Puts a theme on the page. Resolves once its assets (fonts) are loaded — or right away when cached. */
export function applyThemeDom(t: ThemeSpec): Promise<void> {
  const root = document.documentElement;
  root.dataset.theme = t.id;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = themeCss(t);
  if (!t.ui.assets || loaded.has(t.id)) return Promise.resolve();
  loaded.add(t.id);
  return t.ui.assets().then(
    () => undefined,
    () => undefined,
  );
}

/**
 * Soft fade for a live switch: a veil in the new theme's land colour fades in, `apply` runs under it,
 * and it fades out once the map has repainted. Instant when `reduced`.
 */
export function softFade(color: string, apply: () => Promise<void> | void, reduced: boolean): Promise<void> {
  if (reduced) return Promise.resolve(apply());
  const veil = document.createElement('div');
  veil.className = 'theme-veil';
  veil.style.background = color;
  document.body.appendChild(veil);
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return (async () => {
    void veil.offsetWidth;
    veil.classList.add('theme-veil--on');
    await wait(220);
    try {
      await apply();
    } finally {
      await wait(260);
      veil.classList.remove('theme-veil--on');
      await wait(420);
      veil.remove();
    }
  })();
}
