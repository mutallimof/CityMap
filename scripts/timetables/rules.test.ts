import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildTimetables, type SourceFile, type SourceTable } from './rules';
import type { TimetableFile } from '../../src/sim/timetable-data';

const src = JSON.parse(readFileSync('data/timetables-source.json', 'utf8')) as SourceFile;
const committed = JSON.parse(readFileSync('data/timetables.json', 'utf8')) as TimetableFile;
const built = buildTimetables(src, committed.generated);
const trip = (id: string) => Object.values(built.file.lines).flatMap((l) => l.trips).find((t) => t.id === id)!;
const calls = (id: string) => trip(id).calls.map((c) => `${c.stop}${c.dep ? '@' + c.dep : ''}${c.arr ? '>' + c.arr : ''}${c.board === false ? '!' : ''}${c.pier ? '/' + c.pier : ''}`);
const one = (table: Partial<SourceTable>): SourceFile => ({ ...src, tables: [{ ...src.tables[0], ...table } as SourceTable] });

describe('timetable rules', () => {
  it('rebuilds exactly the committed data/timetables.json, with no problems', () => {
    expect(built.problems).toEqual([]);
    expect(built.file).toEqual(committed);
  });

  it('maps the PDF tables onto our seven lines', () => {
    expect(Object.fromEntries(Object.entries(built.file.lines).map(([id, l]) => [id, l.pdf]))).toEqual({
      'kadikoy-karakoy-eminonu': ['KADIKÖY - KARAKÖY - EMİNÖNÜ HATTI (p. 4)'],
      'uskudar-karakoy-eminonu': ['ÜSKÜDAR - KARAKÖY - EMİNÖNÜ HATTI (p. 5)'],
      'kadikoy-besiktas': ['KADIKÖY - BEŞİKTAŞ HATTI (p. 6)', 'KADIKÖY - KARAKÖY - BEŞİKTAŞ HATTI (p. 6)'],
      adalar: ['KABATAŞ - ADALAR HATTI (p. 12)', 'KABATAŞ - ADALAR HATTI (p. 13)'],
      bogaz: ['UZUN BOĞAZ TURU - NOSTALJİK TUR (p. 35)'],
      'rumeli-kavagi-eminonu': ['RUMELİ KAVAĞI - EMİNÖNÜ HATTI (p. 22)', 'EMİNÖNÜ - RUMELİ KAVAĞI HATTI (p. 22)'],
      'anadolu-kavagi-uskudar': ['ANADOLU KAVAĞI - ÜSKÜDAR HATTI (p. 28)'],
    });
  });

  it('reads a cycle row as a round: out via the printed piers, back from the last one', () => {
    expect(calls('kadikoy-karakoy-eminonu:4:out')).toEqual(['kadikoy@07:00', 'karakoy@07:20', 'eminonu']);
    expect(calls('kadikoy-karakoy-eminonu:4:back')).toEqual(['eminonu@07:30', 'kadikoy']);
    expect(calls('uskudar-karakoy-eminonu:1:out')).toEqual(['uskudar@06:25', 'eminonu']);
  });

  it('applies footnotes: weekday-only (*), not Sundays/holidays (**), no boarding (***)', () => {
    expect(trip('kadikoy-karakoy-eminonu:1:out').days).toEqual(['weekday']);
    expect(trip('kadikoy-karakoy-eminonu:2:out').days).toEqual(['weekday', 'saturday']);
    expect(trip('kadikoy-karakoy-eminonu:3:out').days).toEqual(['weekday', 'saturday']);
    expect(calls('kadikoy-karakoy-eminonu:44:out')).toEqual(['kadikoy@20:30', 'karakoy@20:55!', 'eminonu']);
    expect(trip('kadikoy-karakoy-eminonu:44:out').days).toEqual(['weekday', 'saturday', 'sunday']);
    expect(trip('uskudar-karakoy-eminonu:2:back').days).toEqual(['weekday', 'saturday']);
    expect(trip('kadikoy-besiktas:1:kadikoy').days).toEqual(['weekday']);
  });

  it('splits rows that one vessel cannot sail (both piers departing at 21:00)', () => {
    expect(calls('kadikoy-karakoy-eminonu:45:kadikoy')).toEqual(['kadikoy@21:00', 'karakoy']);
    expect(calls('kadikoy-karakoy-eminonu:45:karakoy')).toEqual(['karakoy@21:00', 'kadikoy']);
  });

  it('puts times after midnight on the previous service day', () => {
    expect(calls('kadikoy-karakoy-eminonu:53:kadikoy')).toEqual(['kadikoy@25:00', 'karakoy']);
    expect(calls('kabatas-adalar-weekday-out:15')).toEqual(['kabatas@23:30', 'kadikoy@23:55', 'kinaliada@24:30', 'burgazada@24:45', 'heybeliada@25:00', 'buyukada@25:15']);
    expect(calls('kabatas-adalar-weekday-out:14')).toContain('bostanci>24:05');
  });

  it('night timetable: Fri/Sat nights only, old/new Kadıköy pier kept', () => {
    expect(calls('kadikoy-karakoy-besiktas-night:1:out')).toEqual(['kadikoy@23:45/old', 'besiktas']);
    expect(calls('kadikoy-karakoy-besiktas-night:1:back')).toEqual(['besiktas@24:15', 'kadikoy']);
    expect(calls('kadikoy-karakoy-besiktas-night:5:out')).toEqual(['kadikoy@25:30/new', 'karakoy@25:50', 'besiktas']);
    expect(trip('kadikoy-karakoy-besiktas-night:5:out').weekdays).toEqual([5, 6]);
  });

  it('row tables keep departures and arrivals as printed, skipping "-"', () => {
    expect(calls('kabatas-adalar-weekday-back:1')).toEqual(['buyukada@05:45', 'heybeliada@06:00', 'burgazada@06:15', 'kinaliada@06:30', 'kadikoy>07:05', 'eminonu>07:30', 'kabatas>07:45']);
    expect(calls('kabatas-adalar-weekday-back:4')).toEqual(['buyukada@07:55', 'heybeliada@08:10', 'kabatas>09:05']);
    expect(trip('kabatas-adalar-sunday-out:1').days).toEqual(['sunday']);
    expect(trip('kabatas-adalar-weekday-out:1').days).toEqual(['weekday', 'saturday']);
    expect(calls('uzun-bogaz-out:1').at(-1)).toBe('anadolu-kavagi>12:25');
  });

  it('fails loudly on a footnote it does not know (e.g. a renumbered marker)', () => {
    const t = src.tables[0];
    const r = buildTimetables(one({ footnotes: { ...t.footnotes, '*': 'Sadece bayram günleri yapılır.' } }), 'x');
    expect(r.problems.some((p) => p.includes('no known meaning'))).toBe(true);
  });

  it('fails on a table without a rule and on an unknown day heading', () => {
    expect(buildTimetables(one({ id: 'nope' }), 'x').problems[0]).toMatch(/no rule/);
    expect(buildTimetables(one({ days: 'BAYRAMLARDA' }), 'x').problems[0]).toMatch(/unknown day heading/);
  });

  it('commuter lines: "-" skips the pier, the trip is the actual stop sequence', () => {
    expect(calls('rumeli-kavagi-eminonu:7')).toEqual(['rumeli-kavagi@13:15', 'sariyer@13:25', 'buyukdere@13:30', 'istinye@13:55', 'emirgan@14:00', 'bebek@14:15', 'arnavutkoy@14:20', 'besiktas@14:40', 'eminonu>14:55']);
    expect(calls('rumeli-kavagi-eminonu:3')[0]).toBe('sariyer@09:30');
    expect(calls('eminonu-rumeli-kavagi:2')).toEqual(['eminonu@10:15', 'besiktas@10:30', 'arnavutkoy@10:50', 'bebek@11:00', 'emirgan@11:20', 'istinye@11:25', 'buyukdere@11:55', 'sariyer@12:00']);
    expect(calls('anadolu-kavagi-uskudar:1')[0]).toBe('beykoz@07:00');
    expect(calls('uskudar-anadolu-kavagi:3').at(-1)).toBe('beykoz@17:35');
    expect(trip('anadolu-kavagi-uskudar:1').days).toEqual(['weekday', 'saturday', 'sunday']);
  });
});
