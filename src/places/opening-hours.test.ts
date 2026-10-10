import { describe, expect, it } from 'vitest';
import { openStatus } from './opening-hours';

const MO = 0, FR = 4, SA = 5, SU = 6;
const at = (h: number, m = 0) => h * 60 + m;

describe('openStatus', () => {
  it('handles 24/7 and missing data', () => {
    expect(openStatus('24/7', SU, at(3)).state).toBe('open');
    expect(openStatus(undefined, MO, at(10)).state).toBe('unknown');
    expect(openStatus('sunrise-sunset', MO, at(10)).state).toBe('unknown');
  });

  it('evaluates day ranges, off days and later-rule overrides', () => {
    const oh = 'Mo-Sa 09:00-18:00; Sa 10:00-14:00; Su off';
    expect(openStatus(oh, MO, at(9, 30))).toEqual({ state: 'open', until: at(18) });
    expect(openStatus(oh, SA, at(9, 30))).toEqual({ state: 'closed', until: at(10) });
    expect(openStatus(oh, SA, at(15)).state).toBe('closed');
    expect(openStatus(oh, SU, at(12)).state).toBe('closed');
  });

  it('handles split hours and every-day shorthand', () => {
    expect(openStatus('Tu-Su 10:00-12:00,13:00-19:00', FR, at(12, 30))).toEqual({ state: 'closed', until: at(13) });
    expect(openStatus('10:00-22:00', SU, at(21)).state).toBe('open');
  });

  it('handles hours past midnight', () => {
    const oh = 'Mo-Su 18:00-02:00';
    expect(openStatus(oh, FR, at(23)).state).toBe('open');
    expect(openStatus(oh, SA, at(1))).toEqual({ state: 'open', until: at(2) });
    expect(openStatus(oh, SA, at(3)).state).toBe('closed');
  });

  it('ignores public-holiday rules and open-ended times', () => {
    expect(openStatus('Mo-Fr 08:00-20:00; PH off', MO, at(10)).state).toBe('open');
    expect(openStatus('Fr 20:00+', FR, at(23)).state).toBe('open');
  });
});
