import { ICON_KINDS, type IconKind } from './icons';

/**
 * Map pin images on demand. Drawing all ~110 pin variants (12 kinds × poi / featured / compact, event, open
 * now…) at boot took seconds of main-thread time; now an image is drawn when MapLibre first needs it (the
 * map's missing-image resolver, awaited before a tile's icons are laid out), and the rest in small batches
 * when the browser is idle (prewarm), so zooming in never waits for a burst of drawing. Each made image remembers the recipe key it was drawn with; a change of
 * light (bars glow at night, viewpoints at sunset) or theme redraws only the made images whose key changed.
 * Pure (no DOM): the drawing and the idle scheduler are passed in.
 */

/** What one pin image looks like (the arguments of iconImage / withOpenDot / storyIcon). */
export type PinRecipe =
  | { type: 'icon'; kind: IconKind; size: number; pin?: boolean; glow?: number; glowColor?: string; dot?: number }
  | { type: 'story'; size: number };

/** Everything a recipe depends on besides its id. */
export interface PinContext {
  /** Theme id: colours, bubble / classic pins, story colour. */
  theme: string;
  pinGlow: number;
  eventGlow: string;
  night: boolean;
  golden: boolean;
  sizes: { poiSize: number; featuredSize: number; miniScale: number; landmarkSize: number; storySize: number };
}

const ID = /^(poi|feat|featm)-([a-z]+)(-ev)?(-o)?$/;

/**
 * Image id → recipe (null = not a pin image). Ids: `poi-<kind>` (map POIs), `feat-<kind>[-ev][-o]` (featured
 * pins), `featm-<kind>[-ev][-o]` (compact featured pins at city zoom), `landmark-big`, `story`;
 * `-ev` = a venue with an event today (warm glow), `-o` = open now (green dot).
 */
export function pinRecipe(id: string, c: PinContext): PinRecipe | null {
  const s = c.sizes;
  if (id === 'landmark-big') return { type: 'icon', kind: 'landmark', size: s.landmarkSize, glow: c.night ? 0.9 : 0.5 };
  if (id === 'story') return { type: 'story', size: s.storySize };
  const m = ID.exec(id);
  if (!m || !(ICON_KINDS as string[]).includes(m[2])) return null;
  const kind = m[2] as IconKind;
  const ev = !!m[3];
  const open = !!m[4];
  const glowPoi = (kind === 'bar' && c.night) || (kind === 'viewpoint' && c.golden);
  if (m[1] === 'poi') return ev || open ? null : { type: 'icon', kind, size: s.poiSize, glow: glowPoi ? 1 : 0 };
  // Compact pins for city zoom: no glow margin (collision boxes are the pin itself); an event today keeps a
  // smaller warm glow. Full pins: bubbles stay clean, only an event today (or a bar at night / a viewpoint
  // at sunset) glows; classic pins carry the theme's glow.
  const mini = m[1] === 'featm';
  const size = mini ? s.featuredSize * s.miniScale : s.featuredSize;
  const glow = ev ? { glow: mini ? 1.2 : 1.4, glowColor: c.eventGlow } : mini ? {} : { glow: glowPoi ? 1 : c.pinGlow };
  return { type: 'icon', kind, size, pin: true, ...glow, ...(open ? { dot: size } : {}) };
}

/** Every pin image id the place layers can ask for. */
export function allPinIds(): string[] {
  const ids: string[] = [];
  for (const k of ICON_KINDS) {
    ids.push(`poi-${k}`);
    for (const p of ['featm', 'feat']) for (const v of ['', '-o', '-ev', '-ev-o']) ids.push(`${p}-${k}${v}`);
  }
  ids.push('landmark-big', 'story');
  return ids;
}

/** Identifies a drawing: same key ⇒ same pixels. */
export const recipeKey = (r: PinRecipe, theme: string): string => `${theme}|${JSON.stringify(r)}`;

export interface IdleDeadline {
  timeRemaining(): number;
}
export type IdleScheduler = (fn: (d: IdleDeadline) => void) => void;

/** requestIdleCallback (with a deadline so it still runs on a busy page), else a short timeout. */
export const browserIdle: IdleScheduler = (fn) => {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout: 3000 });
    return;
  }
  setTimeout(() => {
    const t0 = performance.now();
    fn({ timeRemaining: () => Math.max(0, 8 - (performance.now() - t0)) });
  }, 60);
};

export interface LazyImagesOpts<I> {
  /** Recipe of an id in the current context (null = not ours). */
  recipe(id: string): { key: string; build(): I } | null;
  /** Hands an image to the map (add, or update in place). */
  put(id: string, img: I): void;
  idle: IdleScheduler;
  /** Prewarm: at most this many images per idle callback, and only while this much idle time remains (ms). */
  perSlice?: number;
  minRemainingMs?: number;
}

export class LazyImages<I> {
  /** id → key of the drawing the map has. */
  private made = new Map<string, string>();
  private queue: string[] = [];
  private scheduled = false;
  constructor(private o: LazyImagesOpts<I>) {}

  get size(): number {
    return this.made.size;
  }

  has(id: string): boolean {
    return this.made.has(id);
  }

  /** The map needs `id` now (missing-image resolver): draw it synchronously. False if it isn't ours. */
  need(id: string): boolean {
    const r = this.o.recipe(id);
    if (!r) return false;
    this.o.put(id, r.build());
    this.made.set(id, r.key);
    return true;
  }

  /** Light or theme changed: redraw the made images whose recipe changed (they may be on screen). */
  refresh(): string[] {
    const changed: string[] = [];
    for (const [id, key] of this.made) {
      const r = this.o.recipe(id);
      if (!r || r.key === key) continue;
      this.o.put(id, r.build());
      this.made.set(id, r.key);
      changed.push(id);
    }
    return changed;
  }

  /** Draw these when the browser is idle, a few per callback; already made ones are skipped. */
  prewarm(ids: string[]): void {
    const queued = new Set(this.queue);
    for (const id of ids) if (!this.made.has(id) && !queued.has(id)) this.queue.push(id);
    this.schedule();
  }

  /** Images still waiting for idle time. */
  get pending(): number {
    return this.queue.length;
  }

  private schedule(): void {
    if (this.scheduled || !this.queue.length) return;
    this.scheduled = true;
    this.o.idle((d) => {
      this.scheduled = false;
      this.slice(d);
      this.schedule();
    });
  }

  private slice(d: IdleDeadline): void {
    const max = this.o.perSlice ?? 4;
    const min = this.o.minRemainingMs ?? 3;
    let n = 0;
    // At least one per callback (a callback forced by its timeout has no idle time left), then while idle.
    while (this.queue.length && n < max && (n === 0 || d.timeRemaining() > min)) {
      const id = this.queue.shift()!;
      if (this.made.has(id)) continue;
      this.need(id);
      n++;
    }
  }
}
