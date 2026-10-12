import { describe, expect, it } from 'vitest';
import { parseDeepLink } from './deeplink';

describe('parseDeepLink', () => {
  it('reads place, pier, guide and plan links', () => {
    expect(parseDeepLink('#place=osm%3Anode%2F1')).toEqual({ kind: 'place', id: 'osm:node/1' });
    expect(parseDeepLink('#pier=kadikoy')).toEqual({ kind: 'pier', id: 'kadikoy' });
    expect(parseDeepLink('#guide=g1')).toEqual({ kind: 'guide', id: 'g1' });
    expect(parseDeepLink('#plan=1.abc_-')).toEqual({ kind: 'plan', id: '1.abc_-' });
  });
  it('ignores broken percent escapes instead of throwing', () => {
    expect(() => parseDeepLink('#place=%E0%A4%A')).not.toThrow();
    expect(parseDeepLink('#place=%E0%A4%A')).toBeNull();
    expect(parseDeepLink('#pier=%')).toBeNull();
    expect(parseDeepLink('#plan=1.eyJ4%')).toBeNull();
  });
  it('ignores other or empty hashes', () => {
    expect(parseDeepLink('')).toBeNull();
    expect(parseDeepLink('#')).toBeNull();
    expect(parseDeepLink('#place=')).toBeNull();
    expect(parseDeepLink('#foo=bar')).toBeNull();
  });
});
