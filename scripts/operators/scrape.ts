/**
 * Reads the private ferry operators' own published timetables (data/catalog/operators.json) →
 * data/timetables-<operator>.json (same schema as data/timetables.json) + data/operators-log.json.
 * Runs weekly in GitHub Actions (data-refresh.yml); the sandbox can't reach these sites.
 *
 * Polite: robots.txt respected, ≥ 4 s between requests to a host, one request at a time, clear
 * User-Agent, 25 s timeout (scripts/events/http.ts), at most one read per operator in
 * `minIntervalDays` (FORCE=1 overrides). About 16 requests per week in all.
 * Never fatal per line: a failed or odd read (layout change, pair no longer offered, zero departures)
 * keeps that line's last good timetable and logs why; its dates then run out by themselves and the app
 * falls back to the simulated schedule. validate:data blocks empty or broken files.
 *
 * Run: npm run data:operators   (OPERATORS=turyol,dentur FORCE=1 to choose / re-read now)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isoDate } from '../../src/sim/real';
import { toIstanbul } from '../../src/sim/time';
import type { LineTimetable, TimetableFile } from '../../src/sim/timetable-data';
import { politeGet, politePost } from '../events/http';
import { assembleFile, lineTimetable, type LineCatalog, type OperatorCatalog, type PairRead } from './build';
import { parseDenturColumns, parseTuryolDestinations, parseTuryolTable, turyolTitlePiers } from './parse';

interface TuryolPair {
  from: string;
  to: string;
  kalkis: string;
  varis: string;
  title: [string, string];
}
interface DenturSpec {
  page: string;
  columns: Record<string, { from: string; to: string }>;
}
type LineSpec = LineCatalog & { turyol?: TuryolPair[]; dentur?: DenturSpec };
interface Catalog {
  horizonDays: number;
  minIntervalDays: number;
  operators: OperatorCatalog[];
  lines: LineSpec[];
}
export interface OperatorLog {
  generated: string;
  operators: Record<string, { at: string; status: 'ok' | 'partial' | 'failed' | 'skipped'; lines: Record<string, string> }>;
}

const LOG = 'data/operators-log.json';
const cat = JSON.parse(readFileSync('data/catalog/operators.json', 'utf8')) as Catalog;
const FORCE = process.env.FORCE === '1';
const ONLY = process.env.OPERATORS?.split(',').map((s) => s.trim()).filter(Boolean);

const TURYOL = 'https://www.turyol.com';
const destinations = new Map<string, Set<string>>();

/** Turyol: each pair only when the site offers it from that pier, then its table; the title must name the pair. */
async function readTuryol(line: LineSpec): Promise<PairRead[]> {
  const out: PairRead[] = [];
  for (const p of line.turyol ?? []) {
    const [main, type, , pier] = p.kalkis.split('_');
    const key = `${type}_${pier}`;
    if (!destinations.has(key)) {
      const r = await politePost(`${TURYOL}/Tarife/GetVarislar2`, `{'hatTuruId':'${type}','kalkisId':'${pier}','langId':'1'}`, 'application/json; charset=utf-8');
      if (r.status !== 200) throw new Error(`destinations from ${p.from}: HTTP ${r.status}`);
      destinations.set(key, new Set(parseTuryolDestinations(r.text).map((d) => d.id)));
    }
    if (!destinations.get(key)!.has(p.varis)) throw new Error(`${p.from} → ${p.to} is no longer offered by the site`);
    const r = await politePost(`${TURYOL}/Home/Tarifeler`, `MainHatTuruId=${main}&TarifeKalkisId=${p.kalkis}&TarifeVarisId=${p.varis}`, 'application/x-www-form-urlencoded', 'text/html');
    if (r.status !== 200) throw new Error(`${p.from} → ${p.to}: HTTP ${r.status}`);
    const t = parseTuryolTable(r.text);
    const names = turyolTitlePiers(t.title);
    if (!names || !names[0].startsWith(p.title[0]) || !names[1].startsWith(p.title[1])) throw new Error(`asked ${p.title.join(' → ')}, the page shows "${t.title}"`);
    out.push({ from: p.from, to: p.to, columns: t.columns, source: `Turyol: ${t.title}` });
  }
  return out;
}

/** Dentur Avrasya: the line page; every catalogued departure column must be there, nothing unexpected. */
async function readDentur(line: LineSpec): Promise<PairRead[]> {
  const spec = line.dentur!;
  const r = await politeGet(spec.page);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  const cols = parseDenturColumns(r.text);
  const seen = new Set(cols.map((c) => c.pier));
  for (const want of Object.keys(spec.columns)) if (!seen.has(want)) throw new Error(`column "${want} KALKIŞ" missing`);
  for (const c of cols) if (!spec.columns[c.pier]) throw new Error(`unexpected column "${c.pier} KALKIŞ"`);
  return cols.map((c) => ({ ...spec.columns[c.pier], columns: c.columns, continuous: c.continuous, source: `Dentur Avrasya: ${c.pier} KALKIŞ (${new URL(spec.page).pathname})` }));
}

const json = <T>(f: string): T | null => (existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : null);
const withoutDates = (f: TimetableFile | null) => JSON.stringify(f ? { ...f, generated: '' } : null);

async function main() {
  const now = new Date();
  const today = isoDate(toIstanbul(now.getTime()).day);
  const log: OperatorLog = json<OperatorLog>(LOG) ?? { generated: '', operators: {} };
  log.generated = now.toISOString();
  let read = 0;
  for (const op of cat.operators) {
    if (ONLY && !ONLY.includes(op.id)) continue;
    const prev = json<TimetableFile>(op.file);
    const lastRead = Object.values(prev?.lines ?? {})
      .map((l) => l.fetched ?? '')
      .sort()[0];
    if (!FORCE && lastRead && now.getTime() - Date.parse(lastRead) < cat.minIntervalDays * 86_400_000) {
      console.log(`${op.name}: read ${lastRead}, less than ${cat.minIntervalDays} days ago — skipped`);
      continue;
    }
    console.log(`${op.name}:`);
    read++;
    const lines: Record<string, LineTimetable> = { ...(prev?.lines ?? {}) };
    const status: Record<string, string> = {};
    for (const line of cat.lines.filter((l) => l.operator === op.id)) {
      try {
        const reads = op.id === 'turyol' ? await readTuryol(line) : op.id === 'dentur' ? await readDentur(line) : [];
        const lt = lineTimetable(line, reads, { url: line.dentur?.page ?? op.url, fetched: now.toISOString(), today, horizonDays: cat.horizonDays, prev: prev?.lines[line.id] });
        if (!lt.trips.length) throw new Error('no departures on the page');
        lines[line.id] = lt;
        status[line.id] = `ok: ${lt.trips.length} trips`;
        console.log(`  ✓ ${line.id}: ${lt.trips.length} trips${lt.continuous ? `, ${lt.continuous.length} continuous-service windows` : ''}`);
      } catch (e) {
        status[line.id] = `failed: ${(e as Error).message}${lines[line.id] ? ' (kept the last good read)' : ''}`;
        console.warn(`  ✗ ${line.id}: ${status[line.id]}`);
      }
    }
    const ok = Object.values(status).filter((s) => s.startsWith('ok')).length;
    log.operators[op.id] = { at: now.toISOString(), status: ok === Object.keys(status).length ? 'ok' : ok ? 'partial' : 'failed', lines: status };
    if (!Object.keys(lines).length) continue;
    const file = assembleFile(op, lines, today);
    if (withoutDates(file) !== withoutDates(prev)) writeFileSync(op.file, JSON.stringify(file, null, 1) + '\n');
    console.log(`  → ${op.file}`);
  }
  // Nothing read (all skipped): leave the files alone, so the daily job has nothing to commit.
  if (read) writeFileSync(LOG, JSON.stringify(log, null, 1) + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
