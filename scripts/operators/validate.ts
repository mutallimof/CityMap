/**
 * Gate for the private operators' timetables (data/timetables-<operator>.json, scripts/operators), part of
 * `npm run build` (validate:timetables) and `npm run validate:data` (the refresh job):
 *  - shape: operator, source credit, https links, ISO validity per line, trips with "HH:MM" times,
 *    first call departs, times never go backwards, every pier is on the line, the line is in
 *    data/lines.json with this operator;
 *  - sailable: every pair of consecutive calls has a route leg and no printed time asks for a cruise
 *    speed above CONFIG.timetable.maxCruiseKmh (a misread time shows up here);
 *  - continuous-service notes name piers of the line;
 *  - no big drop vs the committed file (a redesign must not wipe a line), never empty after non-empty.
 * Warnings (never fail): a line's dates end within CONFIG.timetable.expiryWarnDays (= its last good read
 * is getting old), or have ended (the app shows that line's simulated schedule).
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import type { FeatureCollection, LineString } from 'geojson';
import { CONFIG } from '../../src/config';
import { kmhToMs } from '../../src/sim/motion';
import { buildNetwork, type RouteProps } from '../../src/sim/network';
import { lineProblems, lineValidity } from '../../src/sim/real';
import { findLeg } from '../../src/sim/schedule';
import { toIstanbul } from '../../src/sim/time';
import { clockToSeconds, type TimetableFile } from '../../src/sim/timetable-data';
import type { LineSpec } from '../../src/sim/types';

const json = <T>(f: string): T => JSON.parse(readFileSync(f, 'utf8')) as T;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAYS = new Set(['weekday', 'saturday', 'sunday']);

function committed<T>(file: string): T | null {
  try {
    return JSON.parse(execSync(`git show HEAD:${file}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 })) as T;
  } catch {
    return null;
  }
}

export interface OperatorCheck {
  problems: string[];
  warnings: string[];
  summary: string[];
}

/** Checks one operator file against the given network (pure apart from reading the committed copy when `prev` is undefined). */
export function checkOperatorFile(file: string, tt: TimetableFile, lines: LineSpec[], routes: FeatureCollection<LineString, RouteProps>, now: number, prev?: TimetableFile | null): OperatorCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  const summary: string[] = [];
  const [, s, , n] = CONFIG.bounds;
  const net = buildNetwork(lines, routes, (s + n) / 2);
  const op = tt.operator?.id;
  if (!op || !tt.operator?.name?.trim() || !tt.operator.site?.startsWith('https://')) problems.push(`${file}: operator id / name / https site missing`);
  if (!tt.source?.trim() || !tt.url?.startsWith('https://')) problems.push(`${file}: source credit / url missing`);
  if (!ISO.test(tt.validFrom ?? '') || !ISO.test(tt.validTo ?? '') || tt.validFrom > tt.validTo) problems.push(`${file}: bad validity ${tt.validFrom} – ${tt.validTo}`);
  if (!tt.lines || !Object.keys(tt.lines).length) problems.push(`${file}: no lines`);
  const p = { ramp: CONFIG.sim.rampSeconds, minDwell: CONFIG.timetable.minDwellS, max: kmhToMs(CONFIG.timetable.maxCruiseKmh) };
  const day = toIstanbul(now).day;
  for (const [id, lt] of Object.entries(tt.lines ?? {})) {
    const input = net.inputs.find((i) => i.line.id === id);
    if (!input) {
      problems.push(`${id}: not a line in data/lines.json`);
      continue;
    }
    if (input.line.operator !== op) problems.push(`${id}: data/lines.json says operator "${input.line.operator ?? 'Şehir Hatları'}", the file is ${op}`);
    if (!lt.pdf?.length) problems.push(`${id}: no source table reference`);
    if (lt.url && !lt.url.startsWith('https://')) problems.push(`${id}: source url not https`);
    if (!ISO.test(lt.validFrom ?? '') || !ISO.test(lt.validTo ?? '') || lt.validFrom! > lt.validTo!) problems.push(`${id}: bad validity ${lt.validFrom} – ${lt.validTo}`);
    if (lt.holidays && lt.holidays !== 'sunday' && lt.holidays !== 'none') problems.push(`${id}: holidays "${lt.holidays}"`);
    if (!lt.trips?.length) problems.push(`${id}: no trips`);
    problems.push(...lineProblems(input.line, input.legs, lt.trips ?? []));
    const ids = new Set<string>();
    for (const t of lt.trips ?? []) {
      if (ids.has(t.id)) problems.push(`${t.id}: trip id twice`);
      ids.add(t.id);
      if (!t.days?.length || t.days.some((d) => !DAYS.has(d))) problems.push(`${t.id}: bad days ${t.days}`);
      let prevT = -1;
      t.calls.forEach((c, i) => {
        for (const v of [c.arr, c.dep]) {
          if (!v) continue;
          const sec = clockToSeconds(v);
          if (sec < prevT) problems.push(`${t.id}: times go backwards at ${c.stop}`);
          if (sec > 30 * 3600) problems.push(`${t.id}: time ${v} beyond the service day`);
          prevT = sec;
        }
        const next = t.calls[i + 1];
        const from = c.dep ?? c.arr;
        const to = next && (next.arr ?? next.dep);
        if (!next || !from || !to) return;
        const leg = findLeg(input.legs, input.line.stops.indexOf(c.stop), input.line.stops.indexOf(next.stop));
        if (!leg) return; // reported by lineProblems
        const D = clockToSeconds(to) - clockToSeconds(from) - (next.arr ? 0 : p.minDwell) - (c.dep ? 0 : p.minDwell);
        const need = D > 2 * p.ramp ? leg.length / (D - p.ramp) : Infinity;
        if (need > p.max) problems.push(`${t.id}: ${c.stop} ${from} → ${next.stop} ${to} needs ${(need * 3.6).toFixed(0)} km/h — misread time?`);
      });
    }
    for (const c of lt.continuous ?? []) {
      if (!input.line.stops.includes(c.stop) || !input.line.stops.includes(c.to)) problems.push(`${id}: continuous service at a pier not on the line (${c.stop} → ${c.to})`);
      try {
        if (clockToSeconds(c.start) >= clockToSeconds(c.end)) problems.push(`${id}: continuous service ${c.start} – ${c.end} ends before it starts`);
      } catch (e) {
        problems.push(`${id}: ${(e as Error).message}`);
      }
    }
    const v = lineValidity(tt, id, day);
    if (v.status === 'expired') warnings.push(`${tt.operator?.name} ${id}: last good read is too old (valid to ${v.validTo}) — the app shows the simulated schedule. Check data/operators-log.json.`);
    else if (v.status === 'valid' && v.daysLeft < CONFIG.timetable.expiryWarnDays) warnings.push(`${tt.operator?.name} ${id}: valid to ${v.validTo} (${v.daysLeft} days left) — the weekly read has not succeeded lately (data/operators-log.json).`);
    summary.push(`${id}: ${lt.trips?.length ?? 0} trips, valid ${lt.validFrom} – ${lt.validTo} (${v.status})`);
  }
  const before = prev === undefined ? committed<TimetableFile>(file) : prev;
  for (const [id, l] of Object.entries(before?.lines ?? {})) {
    const nowN = tt.lines?.[id]?.trips.length ?? 0;
    if (nowN < l.trips.length * 0.5) problems.push(`${id}: ${nowN} trips vs ${l.trips.length} committed — refusing a drop of more than half`);
  }
  return { problems, warnings, summary };
}

/** Every operator file named in data/catalog/operators.json (a missing file is fine until its first read). */
export function validateOperatorTimetables(now = Date.now()): OperatorCheck {
  const out: OperatorCheck = { problems: [], warnings: [], summary: [] };
  const cat = json<{ operators: { id: string; file: string }[]; lines: { id: string; operator: string }[] }>('data/catalog/operators.json');
  const lines = json<{ lines: LineSpec[] }>('data/lines.json').lines;
  const routes = json<FeatureCollection<LineString, RouteProps>>('data/routes.geojson');
  for (const l of cat.lines) if (lines.find((x) => x.id === l.id)?.operator !== l.operator) out.problems.push(`${l.id}: in data/catalog/operators.json but not a ${l.operator} line in data/lines.json`);
  for (const op of cat.operators) {
    if (!existsSync(op.file)) {
      if (committed(op.file)) out.problems.push(`${op.file}: deleted — refusing to lose ${op.id}'s timetable`);
      else out.summary.push(`${op.id}: no timetable read yet — its lines are simulated`);
      continue;
    }
    const tt = json<TimetableFile>(op.file);
    if (tt.operator?.id !== op.id) out.problems.push(`${op.file}: operator "${tt.operator?.id}", expected ${op.id}`);
    const r = checkOperatorFile(op.file, tt, lines, routes, now);
    out.problems.push(...r.problems);
    out.warnings.push(...r.warnings);
    out.summary.push(...r.summary.map((x) => `${op.id} ${x}`));
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = validateOperatorTimetables();
  for (const s of r.summary) console.log(`  ${s}`);
  for (const w of r.warnings) console.log(`::warning::${w}`);
  for (const p of r.problems) console.error(`✗ ${p}`);
  if (r.problems.length) process.exit(1);
  console.log('✓ operator timetables valid');
}
