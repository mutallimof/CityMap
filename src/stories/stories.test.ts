import { describe, expect, it } from 'vitest';
import { formatYear, pickSummary, type Story } from './stories';

const s: Story = {
  osm: 'way/1', wikidata: 'Q1', kind: 'mosque', name: { tr: 'A', en: 'A' }, lngLat: [29, 41], year: 1557,
  architects: [], styles: [], summary: { tr: null, en: 'English text.' }, wiki: { tr: null, en: 'https://en.wikipedia.org/wiki/A' }, photo: null,
};

describe('stories', () => {
  it('formats years incl. BC', () => {
    expect(formatYear(1557, 'en')).toBe('1557');
    expect(formatYear(-330, 'en')).toBe('330 BC');
    expect(formatYear(-330, 'tr')).toBe('MÖ 330');
  });
  it('falls back to the other language', () => {
    expect(pickSummary(s, 'tr')).toEqual({ text: 'English text.', url: 'https://en.wikipedia.org/wiki/A', lang: 'en' });
    expect(pickSummary({ ...s, summary: { tr: null, en: null } }, 'en')).toBeNull();
  });
});
