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
      ['rumeli-kavagi-eminonu', 12],
      ['eminonu-rumeli-kavagi', 12],
      ['anadolu-kavagi-uskudar', 5],
      ['uskudar-anadolu-kavagi', 5],
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

  it('p. 22 Rumeli Kavağı – Eminönü: rows = trips, "-" = pier skipped, arrival at Eminönü', () => {
    const id = 'rumeli-kavagi-eminonu';
    expect(row(id, 0)).toEqual(['07:20', '07:30', '07:35', '08:00', '08:05', '08:20', '08:25', '08:35', '08:45', '09:00']);
    expect(row(id, 2)).toEqual(['-', '09:30', '09:35', '10:00', '10:05', '10:20', '10:25', '10:35', '10:45', '11:00']);
    expect(row(id, 3)).toEqual(['-', '10:30', '10:35', '11:00', '11:05', '11:20', '11:25', '11:40', '11:50', '12:05']);
    expect(row(id, 6)).toEqual(['13:15', '13:25', '13:30', '13:55', '14:00', '14:15', '14:20', '-', '14:40', '14:55']);
    expect(row(id, 10)).toEqual(['17:10', '17:20', '17:25', '17:50', '17:55', '-', '18:15', '18:25', '18:35', '18:50']);
    expect(row(id, 11)).toEqual(['18:30', '18:40', '18:45', '19:10', '19:15', '19:30', '19:35', '19:45', '19:55', '20:10']);
    expect(column(id, 0)).toEqual(['07:20', '08:20', '-', '-', '11:35', '-', '13:15', '-', '-', '16:10', '17:10', '18:30']);
  });

  it('p. 22 Eminönü – Rumeli Kavağı: trips ending at Sarıyer ("-" under Rumeli Kavağı)', () => {
    const id = 'eminonu-rumeli-kavagi';
    expect(table(id).columns.map((c) => c.stop)).toEqual(['eminonu', 'besiktas', 'ortakoy', 'arnavutkoy', 'bebek', 'emirgan', 'istinye', 'buyukdere', 'sariyer', 'rumeli-kavagi']);
    expect(row(id, 0)).toEqual(['09:35', '09:50', '10:00', '10:15', '-', '10:40', '10:45', '11:10', '11:15', '11:25']);
    expect(row(id, 1)).toEqual(['10:15', '10:30', '-', '10:50', '11:00', '11:20', '11:25', '11:55', '12:00', '-']);
    expect(row(id, 6)).toEqual(['15:10', '15:25', '15:35', '15:50', '-', '16:10', '16:20', '16:45', '16:50', '17:00']);
    expect(row(id, 11)).toEqual(['20:20', '20:35', '20:45', '21:00', '21:05', '21:25', '21:30', '21:55', '22:00', '-']);
    expect(column(id, 9)).toEqual(['11:25', '-', '13:05', '-', '-', '16:00', '17:00', '18:00', '19:15', '19:55', '-', '-']);
  });

  it('mismatch: rotated two-word headers ("ANADOLU HİSARI", "RUMELİ KAVAĞI") are matched without spaces', () => {
    expect(table('uskudar-anadolu-kavagi').columns.map((c) => `${c.stop}/${c.kind}`)).toEqual([
      'uskudar/dep',
      'beylerbeyi/dep',
      'cengelkoy/dep',
      'anadolu-hisari/dep',
      'kanlica/dep',
      'cubuklu/dep',
      'pasabahce/dep',
      'beykoz/dep',
      'anadolu-kavagi/arr',
    ]);
    expect(table('rumeli-kavagi-eminonu').columns[0]).toEqual({ stop: 'rumeli-kavagi', kind: 'dep' });
  });

  it('p. 28 Anadolu Kavağı – Üsküdar, both directions', () => {
    const a = 'anadolu-kavagi-uskudar';
    expect(row(a, 0)).toEqual(['-', '07:00', '07:10', '07:20', '07:30', '07:40', '07:55', '08:05', '08:20']);
    expect(row(a, 1)).toEqual(['07:30', '07:50', '08:00', '08:10', '08:20', '08:30', '08:45', '08:55', '09:10']);
    expect(row(a, 2)).toEqual(['14:30', '14:50', '15:00', '15:10', '15:20', '15:30', '15:45', '15:55', '16:10']);
    expect(row(a, 3)).toEqual(['16:00', '16:20', '16:30', '16:40', '16:50', '17:00', '17:15', '17:25', '17:40']);
    expect(row(a, 4)).toEqual(['-', '17:45', '17:55', '18:05', '18:15', '18:25', '18:40', '18:50', '19:05']);
    const b = 'uskudar-anadolu-kavagi';
    expect(row(b, 0)).toEqual(['11:35', '11:50', '12:00', '12:15', '12:25', '12:35', '12:45', '12:55', '13:15']);
    expect(row(b, 1)).toEqual(['13:45', '14:00', '14:10', '14:25', '14:35', '14:45', '14:55', '15:05', '15:25']);
    expect(row(b, 2)).toEqual(['16:15', '16:30', '16:40', '16:55', '17:05', '17:15', '17:25', '17:35', '-']);
    expect(row(b, 3)).toEqual(['17:50', '18:05', '18:15', '18:35', '18:45', '18:55', '19:05', '19:15', '19:35']);
    expect(row(b, 4)).toEqual(['19:10', '19:25', '19:35', '19:50', '20:00', '20:10', '20:20', '20:30', '-']);
  });
});
