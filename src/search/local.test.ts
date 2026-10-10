import { describe, expect, it } from 'vitest';
import { norm, rankResults, score, type SearchResult } from './local';

const r = (kind: SearchResult['kind'], name: string, id = name): SearchResult => ({ kind, id, name, sub: '', icon: '', lngLat: [29, 41] });

describe('local search', () => {
  it('normalises Turkish', () => {
    expect(norm('İstiklal Caddesi')).toBe('istiklal caddesi');
    expect(norm('KADIKÖY')).toBe('kadikoy');
    expect(norm('Üsküdar')).toBe('uskudar');
  });
  it('scores prefix > word prefix > substring', () => {
    expect(score('Kadıköy', 'kad')).toBeGreaterThan(score('Moda Kadıköy', 'kad'));
    expect(score('Moda Kadıköy', 'kad')).toBeGreaterThan(score('Arkadaş', 'kad'));
    expect(score('Galata', 'xyz')).toBe(0);
  });
  it('ranks, dedupes streets by name and limits', () => {
    const items = [r('street', 'Galata Kulesi Sokağı', 'a'), r('street', 'Galata Kulesi Sokağı', 'b'), r('landmark', 'Galata Kulesi'), r('poi', 'Galata Simitçisi')];
    const out = rankResults(items, 'galata');
    expect(out[0].kind).toBe('landmark');
    expect(out.filter((x) => x.kind === 'street')).toHaveLength(1);
  });
});
