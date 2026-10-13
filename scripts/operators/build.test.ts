import { describe, expect, it } from 'vitest';
import { assembleFile, lineTimetable, tripsFromPairs, type PairRead } from './build';

const cols = (weekday: string[], saturday: string[] = [], sunday: string[] = []) => ({ weekday, saturday, sunday });
const read = (from: string, to: string, c: PairRead['columns'], continuous?: PairRead['continuous']): PairRead => ({ from, to, columns: c, continuous, source: `${from} → ${to}` });

describe('tripsFromPairs', () => {
  it('one direct trip per printed departure; the same time on several day types is one trip', () => {
    const { trips } = tripsFromPairs('l', [read('a', 'b', cols(['07:00', '08:00'], ['08:00'])), read('b', 'a', cols(['07:30']))]);
    expect(trips).toEqual([
      { id: 'l:a>b:0700', days: ['weekday'], calls: [{ stop: 'a', dep: '07:00' }, { stop: 'b' }] },
      { id: 'l:b>a:0730', days: ['weekday'], calls: [{ stop: 'b', dep: '07:30' }, { stop: 'a' }] },
      { id: 'l:a>b:0800', days: ['weekday', 'saturday'], calls: [{ stop: 'a', dep: '08:00' }, { stop: 'b' }] },
    ]);
  });

  it('identical columns to several destinations are one sailing calling at them in order (order flagged as inferred)', () => {
    const merge = [{ from: 'k', to: ['x', 'y'], why: 'test' }];
    const { trips, notes } = tripsFromPairs('l', [read('k', 'x', cols(['06:55'], ['06:55'])), read('k', 'y', cols(['06:55'], ['07:10']))], merge);
    // Weekday columns match → one sailing; Saturday's differ → two direct trips, with a note.
    expect(trips).toEqual([
      { id: 'l:k>x+y:0655', days: ['weekday'], orderInferred: true, calls: [{ stop: 'k', dep: '06:55' }, { stop: 'x' }, { stop: 'y' }] },
      { id: 'l:k>x:0655', days: ['saturday'], calls: [{ stop: 'k', dep: '06:55' }, { stop: 'x' }] },
      { id: 'l:k>y:0710', days: ['saturday'], calls: [{ stop: 'k', dep: '07:10' }, { stop: 'y' }] },
    ]);
    expect(notes).toEqual(['saturday: k → x / y printed with different times — kept as separate sailings that day.']);
  });
});

describe('lineTimetable / assembleFile', () => {
  const spec = { id: 'l', operator: 'op', holidays: 'none' as const };
  const reads = [read('a', 'b', cols(['07:00']), [{ days: ['weekday'], start: '16:00', end: '18:30' }])];
  const o = { url: 'https://example.org/t', fetched: '2026-10-13T03:00:00Z', today: '2026-10-13', horizonDays: 45 };

  it('valid from the first read until horizonDays after the last; holidays and continuous windows carried', () => {
    const lt = lineTimetable(spec, reads, o);
    expect(lt.validFrom).toBe('2026-10-13');
    expect(lt.validTo).toBe('2026-11-27');
    expect(lt.holidays).toBe('none');
    expect(lt.continuous).toEqual([{ stop: 'a', to: 'b', days: ['weekday'], start: '16:00', end: '18:30' }]);
  });

  it('unchanged content keeps its first-seen date; changed content starts again', () => {
    const first = lineTimetable(spec, reads, o);
    const later = { ...o, today: '2026-10-20', fetched: '2026-10-20T03:00:00Z' };
    expect(lineTimetable(spec, reads, { ...later, prev: first }).validFrom).toBe('2026-10-13');
    expect(lineTimetable(spec, reads, { ...later, prev: first }).validTo).toBe('2026-12-04');
    const changed = [read('a', 'b', cols(['07:05']))];
    expect(lineTimetable(spec, changed, { ...later, prev: first }).validFrom).toBe('2026-10-20');
  });

  it('the file spans its lines and names its operator', () => {
    const a = lineTimetable(spec, reads, o);
    const b = { ...a, validFrom: '2026-10-01', validTo: '2026-11-01' };
    const f = assembleFile({ id: 'op', name: 'Op', site: 'https://op', file: 'x', source: 'Op timetable', publisher: 'Op', url: 'https://op/t' }, { a, b }, '2026-10-13');
    expect(f.operator).toEqual({ id: 'op', name: 'Op', site: 'https://op' });
    expect([f.validFrom, f.validTo]).toEqual(['2026-10-01', '2026-11-27']);
  });
});
