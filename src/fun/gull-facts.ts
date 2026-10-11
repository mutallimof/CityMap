import type { Map as MlMap } from 'maplibre-gl';
import { CONFIG } from '../config';
import type { VapurLayer } from '../ferries/vapur-layer';
import { ui } from '../ui/store';
import { FACTS } from './facts';

const KEY = 'gullFacts';

/** Facts in a shuffled order that survives reloads, so every fact comes up before any repeats. */
function nextFact(): number {
  let st: { order: number[]; at: number } | null = null;
  try {
    st = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    /* storage unavailable */
  }
  if (!st || st.order.length !== FACTS.length || st.at >= FACTS.length) {
    const order = FACTS.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    st = { order, at: 0 };
  }
  const idx = st.order[st.at++];
  try {
    localStorage.setItem(KEY, JSON.stringify(st));
  } catch {
    /* fine */
  }
  return idx;
}

/**
 * Golden seagulls: tap one and it tells a short Istanbul fact in a bubble that follows it for a few
 * seconds (or until the next tap). Screen position includes the gull's height above the water.
 */
export class GullFacts {
  private el: HTMLDivElement;
  private open: { i: number; until: number } | null = null;
  private raf = 0;

  constructor(
    private map: MlMap,
    private ferries: VapurLayer,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'gullfact';
    this.el.setAttribute('role', 'status');
    this.el.hidden = true;
    map.getContainer().appendChild(this.el);
  }

  private screen(lngLat: [number, number], altM: number): { x: number; y: number } {
    const p = this.map.project(lngLat);
    const mpp = (40_075_016.686 * Math.cos((lngLat[1] * Math.PI) / 180)) / (512 * 2 ** this.map.getZoom());
    return { x: p.x, y: p.y - (altM / mpp) * Math.sin((this.map.getPitch() * Math.PI) / 180) };
  }

  /** Handle a map tap: true when it hit a golden gull (or closed an open bubble). */
  tap(point: { x: number; y: number }): boolean {
    const hit = this.ferries
      .factGulls()
      .map((g) => ({ g, s: this.screen(g.lngLat, g.altM) }))
      .map((h) => ({ ...h, d: Math.hypot(h.s.x - point.x, h.s.y - point.y) }))
      .filter((h) => h.d < CONFIG.gulls.factHitPx)
      .sort((a, b) => a.d - b.d)[0];
    if (!hit) {
      if (this.open) {
        this.close();
        return true;
      }
      return false;
    }
    const f = FACTS[nextFact()];
    const lang = ui.get().lang;
    this.el.innerHTML = '';
    const who = document.createElement('small');
    who.textContent = lang === 'tr' ? 'Martı diyor ki' : 'A gull says';
    const p = document.createElement('p');
    p.textContent = f[lang];
    this.el.append(who, p);
    this.el.hidden = false;
    this.open = { i: hit.g.i, until: performance.now() + CONFIG.gulls.factBubbleMs };
    cancelAnimationFrame(this.raf);
    this.follow();
    return true;
  }

  private follow = (): void => {
    if (!this.open) return;
    const g = this.ferries.factGulls().find((x) => x.i === this.open!.i);
    if (!g || performance.now() > this.open.until) return this.close();
    const s = this.screen(g.lngLat, g.altM);
    this.el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`;
    // near the top (under the controls) the bubble hangs below the gull instead
    this.el.classList.toggle('gullfact--below', s.y < 280);
    this.raf = requestAnimationFrame(this.follow);
  };

  close(): void {
    this.open = null;
    this.el.hidden = true;
    cancelAnimationFrame(this.raf);
  }
}
