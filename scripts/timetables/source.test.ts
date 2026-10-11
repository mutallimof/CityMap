/**
 * The parsed tables (data/timetables-source.json) against values read by eye from the rendered PDF
 * pages (pdftoppm -r 220). Each case below is a cell checked on the image; the "mismatch" cases are
 * the things that went wrong (or nearly) while building the parser.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SourceFile } from './rules';

const src = JSON.parse(readFileSync('data/timetables-source.json', 'utf8')) as SourceFile;
const table = (id: string) => src.tables.find((t) => t.id === id)!;
/** Row r (0-based) as printed: "06:10*" | "-". */
const row = (id: string, r: number) => table(id).rows[r].map((c) => (c ? c.t + (c.m ?? '') : '-'));
const column = (id: string, k: number) => table(id).rows.map((r) => (r[k] ? r[k]!.t + (r[k]!.m ?? '') : '-'));

describe('timetable PDF, parsed tables vs the rendered pages', () => {
  it('has the cover validity and all our tables', () => {
    expect([src.validFrom, src.validTo]).toEqual(['2026-09-07', '2027-06-27']);
    expect(src.tables.map((t) => [t.id, t.rows.length])).toEqual([
      ['kadikoy-karakoy-eminonu', 53],
      ['uskudar-karakoy-eminonu', 46],
      ['kadikoy-besiktas', 34],
      ['kadikoy-karakoy-besiktas-night', 8],
      ['kabatas-adalar-weekday-out', 15],
      ['kabatas-adalar-weekday-back', 15],
      ['kabatas-adalar-sunday-out', 15],
      ['kabatas-adalar-sunday-back', 15],
      ['uzun-bogaz-out', 1],
      ['uzun-bogaz-back', 1],
    ]);
  });

  it('p. 4 Kadıköy – Karaköy – Eminönü: two continuation columns per pier, read down then across', () => {
    const id = 'kadikoy-karakoy-eminonu';
    expect(row(id, 0)).toEqual(['06:10*', '06:35*', '-']);
    expect(row(id, 3)).toEqual(['07:00', '07:20', '07:30']);
    expect(row(id, 32)).toEqual(['16:40', '17:05', '17:15']); // last row of the left half
    expect(row(id, 33)).toEqual(['17:00', '17:25', '17:35']); // first row of the right half
    expect(row(id, 43)).toEqual(['20:30', '20:55***', '21:05']);
    expect(row(id, 52)).toEqual(['01:00', '01:00', '-']);
  });

  it('mismatch: Karaköy 07:05 carries ** (the small render looked like ***)', () => {
    expect(row('kadikoy-karakoy-eminonu', 2)).toEqual(['06:45**', '07:05**', '07:15**']);
  });

  it('mismatch: "-" cells drawn as vector strokes, not text (p. 5 Karaköy, right column)', () => {
    const k = column('uskudar-karakoy-eminonu', 1);
    expect(k.slice(23, 46)).toEqual(['14:15', '14:35', '14:55', '15:15', '-', '-', '16:15', '16:35', '-', '-', '17:35', '-', '-', '18:35', '-', '-', '-', '-', '-', '-', '-', '-', '-']);
  });

  it('p. 5 Üsküdar – Karaköy – Eminönü', () => {
    const id = 'uskudar-karakoy-eminonu';
    expect(row(id, 0)).toEqual(['06:25*', '-', '06:40*']);
    expect(row(id, 2)).toEqual(['07:00', '07:15', '07:20']);
    expect(row(id, 45)).toEqual(['22:00', '-', '22:30']);
  });

  it('p. 6 Kadıköy – Beşiktaş: three continuation columns per pier', () => {
    const id = 'kadikoy-besiktas';
    expect(row(id, 0)).toEqual(['06:45*', '07:15*']);
    expect(row(id, 1)).toEqual(['07:20**', '07:45**']);
    expect(row(id, 12)).toEqual(['12:45', '13:15']);
    expect(row(id, 13)).toEqual(['13:15', '13:45']);
    expect(row(id, 26)).toEqual(['19:45', '20:15']);
    expect(row(id, 33)).toEqual(['23:15', '23:45']);
  });

  it('p. 6 night timetable: old (*) and new (**) Kadıköy pier markers', () => {
    const id = 'kadikoy-karakoy-besiktas-night';
    expect(column(id, 0)).toEqual(['23:45*', '00:15*', '00:45*', '01:15*', '01:30**', '02:35**', '03:45**', '04:55**']);
    expect(column(id, 1)).toEqual(['-', '-', '-', '-', '01:50', '02:55', '04:05', '05:15']);
    expect(column(id, 2)).toEqual(['00:15', '00:45', '01:15', '01:45', '02:05', '03:10', '04:20', '05:30']);
  });

  it('mismatch: pp. 12–13 draw every word twice — each cell is read once', () => {
    for (const id of ['kabatas-adalar-weekday-out', 'kabatas-adalar-weekday-back', 'kabatas-adalar-sunday-out', 'kabatas-adalar-sunday-back']) {
      for (const r of table(id).rows) expect(r).toHaveLength(8);
    }
    expect(row('kabatas-adalar-weekday-out', 0)).toEqual(['06:45', '-', '07:10', '07:45', '08:00', '08:15', '08:30', '09:05']);
    expect(row('kabatas-adalar-weekday-out', 9)).toEqual(['18:25', '-', '-', '-', '-', '19:20', '19:35', '-']);
    expect(row('kabatas-adalar-weekday-out', 10)).toEqual(['18:50', '19:05', '19:25', '20:00', '20:15', '20:30', '20:45', '-']);
    expect(row('kabatas-adalar-weekday-out', 14)).toEqual(['23:30', '-', '23:55', '00:30', '00:45', '01:00', '01:15', '-']);
    expect(row('kabatas-adalar-weekday-back', 0)).toEqual(['-', '05:45', '06:00', '06:15', '06:30', '07:05', '07:30', '07:45']);
    expect(row('kabatas-adalar-weekday-back', 3)).toEqual(['-', '07:55', '08:10', '-', '-', '-', '-', '09:05']);
    expect(row('kabatas-adalar-sunday-out', 0)).toEqual(['07:30', '-', '07:55', '08:30', '08:45', '09:00', '09:15', '09:50']);
    expect(row('kabatas-adalar-sunday-back', 3)).toEqual(['-', '08:15', '08:30', '-', '-', '-', '-', '09:25']);
  });

  it('mismatch: rotated column headers (pp. 12–13) set arrival vs departure columns', () => {
    expect(table('kabatas-adalar-weekday-out').columns.map((c) => c.kind)).toEqual(['dep', 'dep', 'dep', 'dep', 'dep', 'dep', 'dep', 'arr']);
    expect(table('kabatas-adalar-weekday-back').columns.map((c) => `${c.stop}/${c.kind}`)).toEqual([
      'bostanci/dep',
      'buyukada/dep',
      'heybeliada/dep',
      'burgazada/dep',
      'kinaliada/dep',
      'kadikoy/arr',
      'eminonu/arr',
      'kabatas/arr',
    ]);
  });

  it('p. 35 Uzun Boğaz Turu: one trip each way, arrival at the end', () => {
    expect(row('uzun-bogaz-out', 0)).toEqual(['10:35', '10:50', '11:05', '11:35', '12:05', '12:15', '12:25']);
    expect(row('uzun-bogaz-back', 0)).toEqual(['15:00', '15:10', '15:20', '15:40', '16:10', '16:25', '16:40']);
    expect(table('uzun-bogaz-out').columns.at(-1)).toEqual({ stop: 'anadolu-kavagi', kind: 'arr' });
  });

  it('keeps every footnote text as printed', () => {
    expect(table('kadikoy-karakoy-eminonu').footnotes).toEqual({
      '*': 'Cumartesi, pazar ve resmi tatil günleri yapılmaz.',
      '**': 'Pazar ve resmi tatil günleri yapılmaz.',
      '***': 'Karaköy İskelesi’nde yolcu almaz.',
    });
  });
});
