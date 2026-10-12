import { describe, expect, it } from 'vitest';
import { formatCountdown, formatWait, stopsText } from './i18n';

describe('i18n formatting', () => {
  it('formats waits', () => {
    expect(formatWait(10, 'en')).toBe('Now');
    expect(formatWait(240, 'tr')).toBe('4 dk');
    expect(formatWait(3900, 'en')).toBe('1 h 05');
  });
  it('formats countdowns', () => {
    expect(formatCountdown(75)).toBe('1:15');
    expect(formatCountdown(-3)).toBe('0:00');
  });
  it('says 1 stop / n stops', () => {
    expect(stopsText(1, 'en')).toBe('1 stop');
    expect(stopsText(0, 'en')).toBe('0 stops');
    expect(stopsText(3, 'en')).toBe('3 stops');
    expect(stopsText(1, 'tr')).toBe('1 durak');
    expect(stopsText(3, 'tr')).toBe('3 durak');
  });
});
