import { describe, expect, it } from 'vitest';
import { allPinIds, LazyImages, pinRecipe, recipeKey, type IdleDeadline, type PinContext } from './pin-images';
import { ICON_KINDS } from './icons';

const ctx = (o: Partial<PinContext> = {}): PinContext => ({
  theme: 'toy',
  pinGlow: 0,
  eventGlow: '#FFB000',
  night: false,
  golden: false,
  sizes: { poiSize: 22, featuredSize: 30, miniScale: 0.7, landmarkSize: 26, storySize: 18 },
  ...o,
});

describe('pinRecipe', () => {
  it('reads every id the layers ask for, and nothing else', () => {
    for (const id of allPinIds()) expect(pinRecipe(id, ctx()), id).not.toBeNull();
    expect(allPinIds()).toHaveLength(ICON_KINDS.length * 9 + 2);
    for (const id of ['poi-dragon', 'feat-cafe-x', 'poi-cafe-o', 'poi-cafe-ev', 'city-crowns', 'feat-', '']) expect(pinRecipe(id, ctx()), id).toBeNull();
  });

  it('matches the pins drawn before (sizes, glow, event glow, open dot)', () => {
    const c = ctx({ pinGlow: 0.6 });
    expect(pinRecipe('poi-cafe', c)).toEqual({ type: 'icon', kind: 'cafe', size: 22, glow: 0 });
    expect(pinRecipe('feat-museum', c)).toEqual({ type: 'icon', kind: 'museum', size: 30, pin: true, glow: 0.6 });
    expect(pinRecipe('feat-museum-o', c)).toEqual({ type: 'icon', kind: 'museum', size: 30, pin: true, glow: 0.6, dot: 30 });
    expect(pinRecipe('feat-museum-ev-o', c)).toEqual({ type: 'icon', kind: 'museum', size: 30, pin: true, glow: 1.4, glowColor: '#FFB000', dot: 30 });
    expect(pinRecipe('featm-shop', c)).toEqual({ type: 'icon', kind: 'shop', size: 21, pin: true });
    expect(pinRecipe('featm-shop-ev', c)).toEqual({ type: 'icon', kind: 'shop', size: 21, pin: true, glow: 1.2, glowColor: '#FFB000' });
    expect(pinRecipe('featm-shop-o', c)).toEqual({ type: 'icon', kind: 'shop', size: 21, pin: true, dot: 21 });
    expect(pinRecipe('landmark-big', c)).toEqual({ type: 'icon', kind: 'landmark', size: 26, glow: 0.5 });
    expect(pinRecipe('story', c)).toEqual({ type: 'story', size: 18 });
  });

  it('bars glow at night and viewpoints at sunset; the landmark star glows more at night', () => {
    const day = ctx();
    const night = ctx({ night: true });
    const golden = ctx({ golden: true });
    expect(pinRecipe('poi-bar', night)).toMatchObject({ glow: 1 });
    expect(pinRecipe('feat-bar', night)).toMatchObject({ glow: 1 });
    expect(pinRecipe('poi-viewpoint', golden)).toMatchObject({ glow: 1 });
    expect(pinRecipe('poi-viewpoint', night)).toMatchObject({ glow: 0 });
    expect(pinRecipe('landmark-big', night)).toMatchObject({ glow: 0.9 });
    // Only those change with the light.
    const changed = allPinIds().filter((id) => recipeKey(pinRecipe(id, day)!, 'toy') !== recipeKey(pinRecipe(id, night)!, 'toy'));
    expect(changed.sort()).toEqual(['feat-bar', 'feat-bar-o', 'landmark-big', 'poi-bar']);
  });

  it('keys differ by theme', () => {
    const r = pinRecipe('feat-cafe', ctx())!;
    expect(recipeKey(r, 'toy')).not.toBe(recipeKey(r, 'classic'));
  });
});

/** A fake idle queue: callbacks run when the test says so, with the idle time it gives. */
function fakeIdle() {
  const q: ((d: IdleDeadline) => void)[] = [];
  return {
    idle: (fn: (d: IdleDeadline) => void) => void q.push(fn),
    get waiting() {
      return q.length;
    },
    run(ms: number, costMs = 2) {
      let left = ms;
      const fn = q.shift()!;
      fn({ timeRemaining: () => Math.max(0, (left -= costMs)) });
    },
  };
}

function setup(theme = { id: 'toy', night: false }) {
  const idle = fakeIdle();
  const built: string[] = [];
  const map = new Map<string, string>();
  const images = new LazyImages<string>({
    recipe: (id) => (id.startsWith('x') ? null : { key: `${theme.id}|${theme.night && id.includes('bar') ? 'night' : 'day'}`, build: () => (built.push(id), `${id}@${theme.id}`) }),
    put: (id, img) => void map.set(id, img),
    idle: idle.idle,
    perSlice: 3,
    minRemainingMs: 3,
  });
  return { idle, built, map, images, theme };
}

describe('LazyImages', () => {
  it('draws an image only when the map needs it, and ignores ids that are not pins', () => {
    const { images, built, map } = setup();
    expect(built).toEqual([]);
    expect(images.need('feat-cafe')).toBe(true);
    expect(images.need('x-other')).toBe(false);
    expect(built).toEqual(['feat-cafe']);
    expect(map.get('feat-cafe')).toBe('feat-cafe@toy');
  });

  it('prewarms in small idle batches, skipping what is made or queued, never more than perSlice at once', () => {
    const { images, built, idle } = setup();
    images.need('b');
    images.prewarm(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    images.prewarm(['a', 'c']);
    expect(images.pending).toBe(6);
    expect(idle.waiting).toBe(1); // one callback at a time
    idle.run(50);
    expect(built).toEqual(['b', 'a', 'c', 'd']);
    idle.run(0); // forced by its timeout, no idle time: still one, so it always moves on
    expect(built.slice(4)).toEqual(['e']);
    idle.run(5, 2); // 3 ms left after the first: stops there
    expect(built.slice(5)).toEqual(['f']);
    idle.run(50);
    expect(built.slice(6)).toEqual(['g']);
    expect(images.pending).toBe(0);
    expect(idle.waiting).toBe(0);
  });

  it('an image the map asked for while queued is not drawn twice', () => {
    const { images, built, idle } = setup();
    images.prewarm(['a', 'b']);
    images.need('b');
    idle.run(50);
    expect(built).toEqual(['b', 'a']);
  });

  it('refresh redraws only made images whose recipe changed (light), all of them on a theme switch', () => {
    const s = setup();
    s.images.need('feat-bar');
    s.images.need('feat-cafe');
    s.built.length = 0;
    expect(s.images.refresh()).toEqual([]);
    s.theme.night = true;
    expect(s.images.refresh()).toEqual(['feat-bar']);
    s.theme.id = 'classic';
    expect(s.images.refresh().sort()).toEqual(['feat-bar', 'feat-cafe']);
    expect(s.map.get('feat-cafe')).toBe('feat-cafe@classic');
    // Images not made yet are drawn in the new look when needed.
    s.images.need('poi-cafe');
    expect(s.map.get('poi-cafe')).toBe('poi-cafe@classic');
  });
});
