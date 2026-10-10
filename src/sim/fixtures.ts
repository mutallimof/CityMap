import type { LineInput } from './schedule';

/** Test fixtures: synthetic geometry, real-looking service patterns. */
export const SHUTTLE: LineInput = {
  line: {
    id: 'a-b',
    name: { tr: 'A – B', en: 'A – B' },
    color: '#E0A100',
    stops: ['a', 'b'],
    routeId: 'route-a-b',
    service: { first: '07:00', last: '23:30', headwayPeak: 15, headwayOff: 30, dwellMin: 4, speedKmh: 24 },
    simulated: true,
  },
  geometry: { legLengths: [3200] },
};

export const MULTI: LineInput = {
  line: {
    id: 'w-z',
    name: { tr: 'W – Z', en: 'W – Z' },
    color: '#2E8C9A',
    stops: ['w', 'x', 'y', 'z'],
    routeId: 'route-w-z',
    service: { first: '10:00', last: '00:30', headwayPeak: 20, headwayOff: 30, dwellMin: 3, speedKmh: 22 },
    simulated: true,
  },
  // Includes a short 500 m leg that can't reach cruise speed.
  geometry: { legLengths: [2500, 500, 4100] },
};
