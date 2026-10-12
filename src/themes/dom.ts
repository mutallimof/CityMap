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

let paperUrl = '';
/** A small tileable paper texture: fine grain + a few fibres, light grey on white (multiplied over the map). */
function paperTexture(): string {
  if (paperUrl) return paperUrl;
  const n = 192;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(n, n);
  let s = 1234567;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n * n; i++) {
    const v = 255 - Math.floor(rand() * rand() * 46);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v - 2;
    img.data[i * 4 + 2] = v - 8;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(150, 120, 80, 0.08)';
  g.lineWidth = 0.7;
  for (let i = 0; i < 70; i++) {
    const x = rand() * n;
    const y = rand() * n;
    const a = rand() * Math.PI;
    const l = 6 + rand() * 18;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + rand() * 3, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  paperUrl = cv.toDataURL('image/png');
  return paperUrl;
}

/** Paper grain + soft vignette over the map (not the HUD) for painterly themes; strength 0 removes it. */
export function applyPaper(container: HTMLElement, strength: number): void {
  let el = container.querySelector<HTMLDivElement>(':scope > .paper');
  if (strength <= 0) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.className = 'paper';
    container.appendChild(el);
  }
  el.style.backgroundImage = `radial-gradient(130% 100% at 50% 45%, transparent 55%, rgba(110, 70, 30, 0.22) 100%), url(${paperTexture()})`;
  el.style.opacity = String(strength);
}
