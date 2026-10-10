import { describe, expect, it } from 'vitest';
import { isPeak, originDepartures } from './timetable';
import { parseHHMM } from './time';
import { MULTI, SHUTTLE } from './fixtures';

const W = [['07:00', '10:00'], ['17:00', '20:00']] as const;

describe('timetable', () => {
  it('detects peak windows (end-exclusive)', () => {
    expect(isPeak(parseHHMM('07:00'), W)).toBe(true);
    expect(isPeak(parseHHMM('09:59'), W)).toBe(true);
    expect(isPeak(parseHHMM('10:00'), W)).toBe(false);
    expect(isPeak(parseHHMM('18:30'), W)).toBe(true);
  });

  it('uses peak and off-peak headways between first and last', () => {
    const deps = originDepartures(SHUTTLE.line.service, W);
    expect(deps[0]).toBe(parseHHMM('07:00'));
    expect(deps[1] - deps[0]).toBe(15 * 60);
    const at = (hhmm: string) => deps.indexOf(parseHHMM(hhmm));
    expect(deps[at('10:00') + 1] - deps[at('10:00')]).toBe(30 * 60);
    expect(deps[deps.length - 1]).toBeLessThanOrEqual(parseHHMM('23:30'));
  });

  it('runs past midnight when last < first', () => {
    const deps = originDepartures(MULTI.line.service, W);
    expect(deps[deps.length - 1]).toBe(86_400 + parseHHMM('00:30'));
  });
});
