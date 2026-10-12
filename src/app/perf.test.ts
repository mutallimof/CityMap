import { describe, expect, it } from 'vitest';
import { qualityLadder } from './perf';

describe('quality ladder', () => {
  it('drops resolution first, then effects, buildings last', () => {
    const l = qualityLadder(2);
    expect(l.slice(0, 3).map((s) => s.kind)).toEqual(['ratio', 'ratio', 'ratio']);
    const last = l[l.length - 1];
    expect(last.kind === 'effects' && last.knobs.buildings).toBe(false);
  });
  it('thins the toy trees before dropping them, and both before flat buildings', () => {
    const l = qualityLadder(1);
    const at = (pred: (k: Record<string, unknown>) => boolean) => l.findIndex((s) => s.kind === 'effects' && pred(s.knobs));
    expect(at((k) => k.trees === 0.5)).toBeLessThan(at((k) => k.trees === 0));
    expect(at((k) => k.trees === 0)).toBeLessThan(at((k) => k.buildings === false));
  });
  it('skips ratios already below the current one', () => {
    expect(qualityLadder(1.25).filter((s) => s.kind === 'ratio')).toHaveLength(1);
  });
});
