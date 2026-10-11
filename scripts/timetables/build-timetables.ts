/**
 * Parsed timetable tables (data/timetables-source.json, from parse-tarife.py) → trips per app line
 * (data/timetables.json). Pure rules, no guessing of times: every time in the output is printed in
 * the PDF; arrival times that the PDF doesn't print are left out (the app computes them from the
 * route length). How each table becomes trips is written out below, per table, with the reason.
 *
 * Run: npm run data:timetables   (after `python3 scripts/timetables/parse-tarife.py data/raw/tarife.pdf`)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildTimetables, type SourceFile } from './rules';

const source = JSON.parse(readFileSync('data/timetables-source.json', 'utf8')) as SourceFile;
const { file, problems } = buildTimetables(source, new Date().toISOString().slice(0, 10));
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
for (const [id, l] of Object.entries(file.lines)) console.log(`  ✓ ${id.padEnd(26)} ${String(l.trips.length).padStart(3)} trips  ← ${l.pdf.join(' + ')}`);
writeFileSync('data/timetables.json', JSON.stringify(file, null, 1) + '\n');
console.log('Wrote data/timetables.json');
