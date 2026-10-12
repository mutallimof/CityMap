import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { contrast, effectiveTokens, over, parseColor, type Rgb } from './contrast';
import { THEMES } from './registry';

const uiCss = readFileSync(new URL('../ui/ui.css', import.meta.url), 'utf8');
const MIN = 4.5; // WCAG AA, normal text

describe('contrast helpers', () => {
  it('matches known WCAG values', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrast([119, 119, 119], [255, 255, 255])).toBeCloseTo(4.48, 1);
    expect(parseColor('rgba(255, 255, 255, 0.5)').a).toBe(0.5);
  });
});

describe('UI token contrast (WCAG AA, ≥ 4.5:1) in every look, day and night', () => {
  for (const theme of Object.values(THEMES)) {
    for (const night of [false, true]) {
      it(`${theme.id} ${night ? 'night' : 'day'}`, () => {
        const tk = effectiveTokens(uiCss, theme, night);
        const rgb = (name: string): Rgb => parseColor(tk[name] ?? '#000').rgb;
        const panel = rgb('--panel-solid');
        const ink = rgb('--ink');
        // Panels are translucent over the map, and cards / chips tint them: test on a slightly shifted surface too.
        const tinted = over({ rgb: ink, a: 0.1 }, panel);
        const surfaces: [string, Rgb][] = [['panel', panel], ['tinted panel', tinted]];
        const pairs: [string, Rgb, Rgb][] = [];
        for (const [sn, bg] of surfaces) {
          for (const k of ['--ink', '--muted', '--link', '--warn', '--ok', '--bad', '--gold-ink']) pairs.push([`${k} on ${sn}`, rgb(k), bg]);
        }
        // Status badges sit on their own tint (see places.css .openbadge, ui.css .ttbadge).
        pairs.push(['--ok on its badge tint', rgb('--ok'), over({ rgb: [52, 194, 122], a: 0.18 }, panel)]);
        pairs.push(['--bad on its badge tint', rgb('--bad'), over({ rgb: [226, 56, 74], a: 0.13 }, panel)]);
        pairs.push(['--gold-ink on its badge tint', rgb('--gold-ink'), over({ rgb: [224, 161, 0], a: 0.14 }, panel)]);
        pairs.push(['--accent-ink on --accent', rgb('--accent-ink'), rgb('--accent')]);
        pairs.push(['--chip-on-ink on --chip-on', rgb('--chip-on-ink'), rgb('--chip-on')]);
        pairs.push(['--plan-ink on --plan', rgb('--plan-ink'), rgb('--plan')]);
        pairs.push(['--guide-ink on --guide', rgb('--guide-ink'), rgb('--guide')]);
        // Attribution pills sit on the map: worst cases are a black and a white map under the translucent pill.
        const ab = parseColor(tk['--attrib-bg']);
        for (const map of [[0, 0, 0], [255, 255, 255]] as Rgb[]) pairs.push([`--attrib-ink on --attrib-bg over ${map[0] ? 'white' : 'black'} map`, rgb('--attrib-ink'), over(ab, map)]);
        const bad = pairs.map(([n, f, b]) => [n, contrast(f, b)] as const).filter(([, c]) => c < MIN);
        expect(bad.map(([n, c]) => `${n}: ${c.toFixed(2)}`)).toEqual([]);
      });
    }
  }
});
