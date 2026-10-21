/**
 * The pier board (departures, `directionInferred`) and the vessel sheet (the trip a vessel is on,
 * `tripDirectionInferred`) mark exactly the same printed trips as "direction inferred", on the whole
 * network (Şehir Hatları + private operators) and on every kind of day.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { timetableFiles } from './test-files';
import { directionInferred, tripDirectionInferred } from './direction';
import { buildNetwork } from './network';
import { realTripSource } from './real';
import { buildDaySchedule } from './schedule';
import type { HolidayFile } from './timetable-data';
import type { LineSpec, TripRef } from './types';

const json = <T>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const files = timetableFiles(); // operator read windows pinned (test-files.ts)
const holidays = json<HolidayFile>('data/catalog/holidays.json');
const lines = json<{ lines: LineSpec[] }>('data/lines.json').lines;
const net = buildNetwork(lines, json('data/routes.geojson'), 41.05);
const real = realTripSource(files, holidays, (id) => net.inputs.find((i) => i.line.id === id)!.legs);
const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
// Mon, Fri (night line), Sat, Sun, Republic Day (holiday).
const DAYS = ['2026-10-19', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-29'];

describe('pier board and vessel sheet agree on inferred directions', () => {
  for (const iso of DAYS) {
    it(iso, () => {
      const s = buildDaySchedule(net.inputs, dayOf(iso), undefined, real);
      const trips = new Map<string, TripRef>();
      for (const v of s.vessels) for (const g of v.segments) if (g.trip) trips.set(g.trip.id, g.trip);
      const board = new Map<string, boolean>();
      for (const d of s.departures) {
        const t = trips.get(d.tripId);
        expect(t, d.tripId).toBeDefined();
        // Board → sheet: every departure's mark is its trip's mark on the vessel sheet.
        expect(directionInferred(d), `${d.tripId} at ${d.stopId}`).toBe(tripDirectionInferred(t!));
        board.set(d.tripId, (board.get(d.tripId) ?? false) || directionInferred(d));
      }
      // Sheet → board: every trip marked on the vessel sheet has a marked departure on the board, and vice versa.
      for (const [id, t] of trips) if (board.has(id)) expect(tripDirectionInferred(t), id).toBe(board.get(id));
      // Both kinds occur (cycle tables and merged operator sailings), so the test checks something.
      const marked = [...trips.values()].filter(tripDirectionInferred);
      expect(marked.some((t) => !t.orderInferred)).toBe(true);
      // (Operators' lines run their simulated schedule on public holidays: no printed merged sailings then.)
      expect(marked.some((t) => t.orderInferred)).toBe(iso !== '2026-10-29');
      expect([...trips.values()].some((t) => t.real && !tripDirectionInferred(t))).toBe(true);
    });
  }
});
