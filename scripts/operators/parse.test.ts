import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDenturColumns, parseTuryolDestinations, parseTuryolTable, rscPayload, serviceDayTimes, turyolTitlePiers } from './parse';

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

describe('Turyol', () => {
  it('reads a pier-pair table: title, three day columns, empty cells skipped', () => {
    const r = parseTuryolTable(fixture('turyol-table.html'));
    expect(r.title).toBe('Kadıköy Metro İskele Kalkış / Karaköy');
    expect(turyolTitlePiers(r.title)).toEqual(['kadıköy metro', 'karaköy']);
    expect(r.columns).toEqual({ weekday: ['07:25', '16:35', '21:00'], saturday: ['07:25', '16:40', '20:20', '21:30'], sunday: ['08:40', '21:30'] });
  });

  it('reads the offered destinations and drops the placeholder', () => {
    expect(parseTuryolDestinations(fixture('turyol-destinations.json'))).toEqual([
      { id: '105', name: 'Kadıköy Yeni İskele' },
      { id: '103', name: 'Üsküdar İskele' },
    ]);
  });

  it('refuses a page without the timetable, an unknown column or a strange cell', () => {
    expect(() => parseTuryolTable('<html>maintenance</html>')).toThrow(/no timetable/);
    const t = fixture('turyol-table.html');
    expect(() => parseTuryolTable(t.replace('PAZAR', 'BAYRAM'))).toThrow(/unknown day column/);
    expect(() => parseTuryolTable(t.replace('16:35', 'iptal'))).toThrow(/unexpected cell/);
    expect(() => parseTuryolTable(t.replace('21:00', '07:00'))).toThrow(/backwards/);
  });
});

describe('Dentur Avrasya', () => {
  it('joins the RSC payload strings', () => {
    expect(rscPayload(fixture('dentur-line.html'))).toContain('<div class="column-title">ÜSKÜDAR KALKIŞ</div>');
  });

  it('reads both departure columns, after-midnight times and the continuous-service windows', () => {
    const [usk, kab, ...rest] = parseDenturColumns(fixture('dentur-line.html'));
    expect(rest).toEqual([]);
    expect(usk.pier).toBe('ÜSKÜDAR');
    expect(usk.columns).toEqual({ weekday: ['06:45', '17:30', '23:40', '24:00'], saturday: ['08:00', '19:15', '19:30', '23:40', '24:00'], sunday: ['09:00', '23:40', '24:00'] });
    expect(usk.continuous).toEqual([{ days: ['weekday'], start: '16:00', end: '18:30' }]);
    expect(kab.pier).toBe('KABATAŞ');
    expect(kab.columns.saturday).toEqual(['08:10', '09:40', '23:50', '24:15']);
    expect(kab.continuous).toEqual([{ days: ['weekday'], start: '08:10', end: '09:10' }]);
  });

  it('refuses a page whose layout changed', () => {
    expect(() => parseDenturColumns('<html><script>self.__next_f.push([1,"hello"])</script></html>')).toThrow(/no departure columns/);
    expect(() => parseDenturColumns(fixture('dentur-line.html').replace('KALKI\\u015e', 'VARI\\u015e'))).toThrow(/column title/);
  });
});

describe('serviceDayTimes', () => {
  it('moves times after midnight to 24:00+ once the column has reached the evening', () => {
    expect(serviceDayTimes(['22:40', '23:50', '00:15', '00:45'])).toEqual(['22:40', '23:50', '24:15', '24:45']);
  });
  it('refuses a column going backwards in the day or a time printed twice', () => {
    expect(() => serviceDayTimes(['09:00', '08:00'])).toThrow(/backwards/);
    expect(() => serviceDayTimes(['23:00', '00:30', '06:00'])).toThrow(/backwards/);
    expect(() => serviceDayTimes(['09:00', '09:00'])).toThrow(/twice/);
  });
});
