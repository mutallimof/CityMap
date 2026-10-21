/**
 * Test support only (imported by *.test.ts, never by the app). The committed operator timetables are rewritten by
 * the weekly read, which moves each line's validFrom / validTo; tests that use fixed dates pin those windows here
 * to the first read (2026-10-13 + 45 days) so they don't start failing when the files are refreshed.
 */
import { readFileSync } from 'node:fs';
import type { TimetableFile } from './timetable-data';

export const PINNED_READ = { validFrom: '2026-10-13', validTo: '2026-11-27' } as const;

/** Şehir Hatları file as committed; operator files with every read window set to PINNED_READ. */
export function timetableFiles(paths = ['data/timetables.json', 'data/timetables-turyol.json', 'data/timetables-dentur.json']): TimetableFile[] {
  return paths.map((p) => pinReads(JSON.parse(readFileSync(p, 'utf8')) as TimetableFile));
}

export function pinReads(f: TimetableFile): TimetableFile {
  if (!f.operator) return f;
  return { ...f, ...PINNED_READ, lines: Object.fromEntries(Object.entries(f.lines).map(([id, l]) => [id, { ...l, ...PINNED_READ }])) };
}
