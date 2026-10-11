import type { LineInput } from './schedule';

/** Test fixtures: synthetic geometry, real-looking service patterns. */
export const SHUTTLE: LineInput = {
  line: {
    id: 'a-b',
    name: { tr: 'A – B', en: 'A – B' },
    color: '#E0A100',
    stops: ['a', 'b'],
    pattern: ['a', 'b'],
    service: { first: '07:00', last: '23:30', headwayPeak: 15, headwayOff: 30, dwellMin: 4, speedKmh: 24 },
  },
  legs: [{ from: 0, to: 1, length: 3200 }],
};

export const MULTI: LineInput = {
  line: {
    id: 'w-z',
    name: { tr: 'W – Z', en: 'W – Z' },
    color: '#2E8C9A',
    stops: ['w', 'x', 'y', 'z'],
    pattern: ['w', 'x', 'y', 'z'],
    service: { first: '10:00', last: '00:30', headwayPeak: 20, headwayOff: 30, dwellMin: 3, speedKmh: 22 },
  },
  // Includes a short 500 m leg that can't reach cruise speed.
  legs: [
    { from: 0, to: 1, length: 2500 },
    { from: 1, to: 2, length: 500 },
    { from: 2, to: 3, length: 4100 },
  ],
};

/**
 * A timetabled line shaped like Kadıköy – Karaköy – Eminönü: a round K → Kr → E, back E → K direct
 * (its own leg), plus a K ⇄ Kr shuttle.
 */
export const ROUND: LineInput = {
  line: {
    id: 'k-e',
    name: { tr: 'K – Kr – E', en: 'K – Kr – E' },
    color: '#E0A100',
    stops: ['k', 'kr', 'e'],
    pattern: ['k', 'kr', 'e'],
    service: { first: '07:00', last: '23:30', headwayPeak: 20, headwayOff: 20, dwellMin: 4, speedKmh: 24 },
  },
  legs: [
    { from: 0, to: 1, length: 5450 },
    { from: 1, to: 2, length: 460 },
    { from: 2, to: 0, length: 5200 },
  ],
};
