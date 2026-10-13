/**
 * Gate for data/timetables.json (part of `npm run build` and `npm run validate:data`):
 *  - shape: source credit, validity dates, lines with trips, times "HH:MM", first call departs,
 *    times never go backwards, every pier is on the line;
 *  - sailable: every pair of consecutive calls has a route leg, and printed times never ask for a
 *    cruise speed above CONFIG.timetable.maxCruiseKmh (a misread time shows up here);
 *  - matches the rules: rebuilding from data/timetables-source.json gives the committed trips;
 *  - holidays: data/catalog/holidays.json covers the whole validity period;
 *  - no big drop vs the committed file (a broken re-parse must not wipe the timetables).
 * Warnings (never fail): the timetable ends within CONFIG.timetable.expiryWarnDays, or has ended
 * (the app then shows the simulated schedule).
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import type { FeatureCollection, LineString } from 'geojson';
import { CONFIG } from '../../src/config';
import { buildNetwork, type RouteProps } from '../../src/sim/network';
import { daysLeft, lineProblems, timetableStatus } from '../../src/sim/real';
import { findLeg } from '../../src/sim/schedule';
import { kmhToMs } from '../../src/sim/motion';
import { toIstanbul } from '../../src/sim/time';
import { clockToSeconds, type HolidayFile, type TimetableFile } from '../../src/sim/timetable-data';
import type { LineSpec } from '../../src/sim/types';
import { buildTimetables, type SourceFile } from './rules';

const json = <T>(f: string): T => JSON.parse(readFileSync(f, 'utf8')) as T;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function committed<T>(file: string): T | null {
  try {
    return JSON.parse(execSync(`git show HEAD:${file}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 })) as T;
  } catch {
    return null;
  }
}

export function validateTimetables(now = Date.now()): { problems: string[]; warnings: string[]; summary: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  const summary: string[] = [];
  const file = 'data/timetables.json';
  if (!existsSync(file)) return { problems: [`${file} missing`], warnings, summary };
  const tt = json<TimetableFile>(file);
  const lines = json<{ lines: LineSpec[] }>('data/lines.json').lines;
  const routes = json<FeatureCollection<LineString, RouteProps>>('data/routes.geojson');
  const holidays = json<HolidayFile>('data/catalog/holidays.json');
  const [, s, , n] = CONFIG.bounds;
  const net = buildNetwork(lines, routes, (s + n) / 2);

  if (!tt.source?.trim() || !tt.url?.startsWith('https://')) problems.push(`${file}: source credit / url missing`);
  if (!ISO.test(tt.validFrom ?? '') || !ISO.test(tt.validTo ?? '') || tt.validFrom >= tt.validTo) problems.push(`${file}: bad validity ${tt.validFrom} – ${tt.validTo}`);
  if (!tt.lines || !Object.keys(tt.lines).length) problems.push(`${file}: no lines`);
  if (!(holidays.covers[0] <= tt.validFrom && holidays.covers[1] >= tt.validTo)) {
    problems.push(`data/catalog/holidays.json covers ${holidays.covers.join(' – ')}, the timetable runs ${tt.validFrom} – ${tt.validTo}: add the holidays`);
  }

  const p = { ramp: CONFIG.sim.rampSeconds, minDwell: CONFIG.timetable.minDwellS, max: kmhToMs(CONFIG.timetable.maxCruiseKmh) };
  for (const [id, lt] of Object.entries(tt.lines ?? {})) {
    const input = net.inputs.find((i) => i.line.id === id);
    if (!input) {
      problems.push(`${id}: not a line in data/lines.json`);
      continue;
    }
    if (!lt.pdf?.length) problems.push(`${id}: no source table reference`);
    problems.push(...lineProblems(input.line, input.legs, lt.trips ?? []));
    for (const t of lt.trips ?? []) {
      if (!t.days?.length) problems.push(`${t.id}: runs on no day`);
      let prev = -1;
      t.calls.forEach((c, i) => {
        for (const v of [c.arr, c.dep]) {
          if (!v) continue;
          const sec = clockToSeconds(v);
          if (sec < prev) problems.push(`${t.id}: times go backwards at ${c.stop}`);
          if (sec > 30 * 3600) problems.push(`${t.id}: time ${v} beyond the service day`);
          prev = sec;
        }
        const next = t.calls[i + 1];
        const from = c.dep ?? c.arr;
        const to = next && (next.arr ?? next.dep);
        if (!next || !from || !to) return;
        const leg = findLeg(input.legs, input.line.stops.indexOf(c.stop), input.line.stops.indexOf(next.stop));
        if (!leg) return; // reported by lineProblems
        const D = clockToSeconds(to) - clockToSeconds(from) - (next.arr ? 0 : p.minDwell) - (c.dep ? 0 : p.minDwell);
        const need = D > 2 * p.ramp ? leg.length / (D - p.ramp) : Infinity;
        if (need > p.max) problems.push(`${t.id}: ${c.stop} ${from} → ${next.stop} ${to} needs ${(need * 3.6).toFixed(0)} km/h over ${(leg.length / 1000).toFixed(1)} km — misread time?`);
      });
    }
    summary.push(`${id}: ${lt.trips.length} trips (${lt.pdf.join(' + ')})`);
  }
  for (const l of lines) if (!l.operator && !tt.lines?.[l.id]) summary.push(`${l.id}: no timetable — simulated`);

  // Committed trips must be exactly what the rules make of the parsed tables.
  if (existsSync('data/timetables-source.json')) {
    const rebuilt = buildTimetables(json<SourceFile>('data/timetables-source.json'), tt.generated);
    problems.push(...rebuilt.problems);
    if (JSON.stringify(rebuilt.file.lines) !== JSON.stringify(tt.lines)) problems.push(`${file}: differs from the rules applied to data/timetables-source.json — run npm run data:timetables`);
  } else problems.push('data/timetables-source.json missing');

  const prev = committed<TimetableFile>(file);
  if (prev?.lines) {
    for (const [id, l] of Object.entries(prev.lines)) {
      const now = tt.lines?.[id]?.trips.length ?? 0;
      if (now < l.trips.length * 0.5) problems.push(`${id}: ${now} trips vs ${l.trips.length} committed — refusing a drop of more than half`);
    }
  }

  const day = toIstanbul(now).day;
  const status = timetableStatus(tt, day);
  const left = status === 'missing' ? 0 : daysLeft(tt, day);
  if (status === 'expired') warnings.push(`Ferry timetable "${tt.source}" ended ${tt.validTo}: the app shows the simulated schedule. Parse the new PDF (scripts/timetables/README.md).`);
  else if (status === 'valid' && left < CONFIG.timetable.expiryWarnDays) warnings.push(`Ferry timetable "${tt.source}" ends ${tt.validTo} — ${left} days left. Parse the new PDF (scripts/timetables/README.md).`);
  summary.push(`valid ${tt.validFrom} – ${tt.validTo} (${status}${status === 'valid' ? `, ${left} days left` : ''})`);
  return { problems, warnings, summary };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = validateTimetables();
  for (const s of r.summary) console.log(`  ${s}`);
  for (const w of r.warnings) console.log(`::warning::${w}`);
  for (const p of r.problems) console.error(`✗ ${p}`);
  if (r.problems.length) process.exit(1);
  console.log('✓ timetables valid');
}
