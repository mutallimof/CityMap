import { describe, expect, it } from 'vitest';
import { formatHHMM, fromIstanbul, jumpTo, parseHHMM, simNow, toIstanbul, withSpeed } from './time';

describe('time', () => {
  it('parses and formats HH:MM', () => {
    expect(parseHHMM('07:05')).toBe(7 * 3600 + 300);
    expect(formatHHMM(parseHHMM('23:30'))).toBe('23:30');
    expect(formatHHMM(86_400 + 60)).toBe('00:01');
    expect(() => parseHHMM('7h')).toThrow();
  });

  it('converts to Istanbul local time (UTC+3)', () => {
    const t = toIstanbul(Date.UTC(2026, 9, 10, 21, 30)); // 21:30 UTC → 00:30 next day
    expect(t.seconds).toBe(30 * 60);
    expect(fromIstanbul(t)).toBe(Date.UTC(2026, 9, 10, 21, 30));
    const prev = toIstanbul(Date.UTC(2026, 9, 10, 20, 59));
    expect(prev.day).toBe(t.day - 1);
  });

  it('sim clock never jumps when speed changes', () => {
    let c = { anchorRealMs: 0, anchorSimMs: 1_000_000, speed: 1 };
    expect(simNow(c, 5_000)).toBe(1_005_000);
    c = withSpeed(c, 60, 5_000);
    expect(simNow(c, 5_000)).toBe(1_005_000);
    expect(simNow(c, 6_000)).toBe(1_065_000);
    c = jumpTo(c, 0, 6_000);
    expect(simNow(c, 7_000)).toBe(60_000);
  });
});
