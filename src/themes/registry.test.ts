import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { classic } from './classic';
import { defineTheme, merge } from './define';
import { themeCss } from './dom';
import { DEFAULT_THEME, initialThemeId, look, onTheme, setTheme, THEMES, themeById } from './registry';

const memStore = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('theme registry', () => {
  it('has unique ids, Classic first, and the default exists', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('classic');
    expect(themeById(DEFAULT_THEME)).toBeDefined();
    for (const t of THEMES) {
      expect(t.name.tr && t.name.en && t.blurb.tr && t.blurb.en).toBeTruthy();
      for (const c of Object.values(t.card)) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('Classic is the original look: every value from CONFIG', () => {
    expect(classic.colors).toEqual(JSON.parse(JSON.stringify(CONFIG.colors)));
    expect(classic.city.day).toEqual(JSON.parse(JSON.stringify(CONFIG.city.day)));
    expect(classic.city.night.buildings).toEqual([...CONFIG.city.night.buildings]);
    expect(classic.weather.fogColor).toBe(CONFIG.weather.fogColor);
    expect(classic.icons.colors).toEqual({ ...CONFIG.icons.colors });
    expect(classic.style.buildings.cap).toBe(false);
    // copies, never the CONFIG objects themselves
    expect(classic.colors.day).not.toBe(CONFIG.colors.day);
  });

  it('every theme has every field Classic has (same shape)', () => {
    const shape = (x: unknown): unknown => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, shape((x as Record<string, unknown>)[k])])) : typeof x);
    const { ui: _u, ...c } = classic;
    for (const t of THEMES) {
      const { ui: _v, ...rest } = t;
      expect(shape(rest)).toEqual(shape(c));
    }
  });

  it('defineTheme merges over Classic; arrays replace, objects merge, inputs untouched', () => {
    const t = defineTheme({ id: 'x', name: { tr: 'X', en: 'X' }, blurb: { tr: 'x', en: 'x' }, card: classic.card, colors: { day: { water: '#123456' } }, city: { day: { residential: ['#111111'] } } });
    expect(t.colors.day.water).toBe('#123456');
    expect(t.colors.day.land).toBe(classic.colors.day.land);
    expect(t.city.day.residential).toEqual(['#111111']);
    expect(t.city.day.park).toBe(classic.city.day.park);
    expect(classic.colors.day.water).toBe(CONFIG.colors.day.water);
    expect(merge({ a: [1, 2], b: { c: 1, d: 2 } }, { a: [3], b: { d: 4 } })).toEqual({ a: [3], b: { c: 1, d: 4 } });
  });
});

describe('theme choice and persistence', () => {
  it('?theme= wins (when known), then the saved one, then the default', () => {
    const id = THEMES[THEMES.length - 1].id;
    expect(initialThemeId(`?theme=${id}`, memStore())).toBe(id);
    expect(initialThemeId('?theme=nope', memStore({ 'theme:v1': id }))).toBe(id);
    expect(initialThemeId('', memStore({ 'theme:v1': 'gone' }))).toBe(DEFAULT_THEME);
    expect(initialThemeId('', null)).toBe(DEFAULT_THEME);
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(initialThemeId('', throwing)).toBe(DEFAULT_THEME);
  });

  it('setTheme saves on the device, notifies, ignores unknown ids', () => {
    const store = memStore();
    const seen: string[] = [];
    const off = onTheme((t) => seen.push(t.id));
    const before = look().id;
    expect(setTheme('nope', { store }).id).toBe(before);
    expect(store.m.size).toBe(0);
    for (const t of THEMES) setTheme(t.id, { store });
    expect(store.getItem('theme:v1')).toBe(THEMES[THEMES.length - 1].id);
    expect(initialThemeId('', store)).toBe(THEMES[THEMES.length - 1].id);
    setTheme(before, { store, save: false });
    expect(store.getItem('theme:v1')).toBe(THEMES[THEMES.length - 1].id);
    expect(look().id).toBe(before);
    off();
    expect(seen.every((s) => themeById(s))).toBe(true);
  });

  it('theme CSS: day tokens, night overrides, scoped to the theme', () => {
    const t = defineTheme({ id: 'zz', name: { tr: 'Z', en: 'Z' }, blurb: { tr: 'z', en: 'z' }, card: classic.card, ui: { vars: { '--panel': '#fff' }, nightVars: { '--panel': '#000' }, css: '.a{}' } });
    const css = themeCss(t);
    expect(css).toContain(":root[data-theme='zz'] {\n  --panel: #fff;\n}");
    expect(css).toContain(":root[data-theme='zz'][data-night='1'] {\n  --panel: #000;\n}");
    expect(css.endsWith('.a{}')).toBe(true);
    expect(themeCss(classic)).toBe('');
  });
});
