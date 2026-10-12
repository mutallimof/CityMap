import { describe, expect, it } from 'vitest';
import { formatYear, pickSummary, storiesNeeded, type Story } from './stories';
import { CONFIG } from '../config';

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

describe('storiesNeeded', () => {
  it('loads the stories just before story markers appear, for a place sheet or the skyline test', () => {
    const z = CONFIG.places.storiesFrom;
    expect(storiesNeeded({ zoom: 12, placeOpen: false, skyline: false })).toBe(false);
    expect(storiesNeeded({ zoom: CONFIG.camera.zoom, placeOpen: false, skyline: false })).toBe(false);
    expect(storiesNeeded({ zoom: z - 0.3, placeOpen: false, skyline: false })).toBe(true);
    expect(storiesNeeded({ zoom: 11, placeOpen: true, skyline: false })).toBe(true);
    expect(storiesNeeded({ zoom: 11, placeOpen: false, skyline: true })).toBe(true);
  });
});
