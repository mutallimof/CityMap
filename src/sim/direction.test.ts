import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { directionInferred, INFERRED_DIRECTION_TRIPS, PRINTED_DIRECTION_TRIPS } from './direction';
import type { TimetableFile } from './timetable-data';

const tt = JSON.parse(readFileSync('data/timetables.json', 'utf8')) as TimetableFile;

describe('direction of printed departures', () => {
  it('every trip in the timetable file is classified (a new table must be looked at, not defaulted)', () => {
    const unknown = Object.values(tt.lines)
      .flatMap((l) => l.trips.map((t) => t.id))
      .filter((id) => ![...INFERRED_DIRECTION_TRIPS, ...PRINTED_DIRECTION_TRIPS].some((p) => id.startsWith(p)));
    expect(unknown).toEqual([]);
  });

  it('the two sets do not overlap', () => {
    for (const a of INFERRED_DIRECTION_TRIPS) for (const b of PRINTED_DIRECTION_TRIPS) expect(a.startsWith(b) || b.startsWith(a)).toBe(false);
  });

  it('cycle-table departures are flagged, row-table and two-pier ones are not', () => {
    expect(directionInferred({ tripId: 'kadikoy-karakoy-eminonu:3:out', real: true })).toBe(true);
    expect(directionInferred({ tripId: 'kadikoy-karakoy-eminonu:3:karakoy', real: true })).toBe(true);
    expect(directionInferred({ tripId: 'uskudar-karakoy-eminonu:7:back', real: true })).toBe(true);
    expect(directionInferred({ tripId: 'kadikoy-karakoy-besiktas-night:1:back', real: true })).toBe(true);
    expect(directionInferred({ tripId: 'kadikoy-besiktas:3:besiktas', real: true })).toBe(false);
    expect(directionInferred({ tripId: 'rumeli-kavagi-eminonu:2', real: true })).toBe(false);
    expect(directionInferred({ tripId: 'kabatas-adalar-weekday-out:4', real: true })).toBe(false);
  });

  it('simulated departures claim nothing printed, so they are never flagged', () => {
    expect(directionInferred({ tripId: 'kadikoy-karakoy-eminonu:0:12:out', real: false })).toBe(false);
  });
});
