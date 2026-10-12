import { describe, expect, it } from 'vitest';
import { escapeAction } from './escape';

const base = { search: false, themes: false, legend: false, timePanel: false, selection: null, sheetSnap: 'peek' as const };

describe('escapeAction', () => {
  it('does nothing when nothing is open', () => {
    expect(escapeAction(base)).toBeNull();
  });
  it('closes the top-most layer first, one per press', () => {
    let s: typeof base & { selection: unknown } = { ...base, search: true, themes: true, legend: true, timePanel: true, selection: { kind: 'place', id: 'x' }, sheetSnap: 'full' } as never;
    const order: string[] = [];
    for (let i = 0; i < 8; i++) {
      const a = escapeAction(s as never);
      if (!a) break;
      order.push(Object.keys(a)[0]);
      s = { ...s, ...a } as never;
    }
    expect(order).toEqual(['search', 'themes', 'legend', 'timePanel', 'selection']);
    expect(escapeAction(s as never)).toBeNull();
  });
  it('closing a selection also stops following and drops the sheet to its peek', () => {
    expect(escapeAction({ ...base, selection: { kind: 'vessel', id: 'v' }, sheetSnap: 'half' })).toEqual({ selection: null, follow: false, sheetSnap: 'peek' });
  });
  it('collapses an expanded feed sheet', () => {
    expect(escapeAction({ ...base, sheetSnap: 'full' })).toEqual({ sheetSnap: 'peek' });
  });
});
