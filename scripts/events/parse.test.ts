import { describe, expect, it } from 'vitest';
import { findOccurrences, norm, parseDateList, guessCategory, htmlToText, inferYear, isFree, pageTitle, priceIn, ticketLink } from './parse';

const now = new Date('2026-10-11T10:00:00Z');

describe('event parsing', () => {
  it('finds dated sessions in the formats the venues use', () => {
    expect(findOccurrences('Salt Beyoğlu | 17 Ekim 2026 · 14.00 | Yorumlama', now)).toEqual([{ start: '2026-10-17T14:00:00+03:00' }]);
    expect(findOccurrences('3-6 Yaş | 16 Eylül 2026 / 13.30 | 15 Ekim 2026 / 13.30', now).map((o) => o.start)).toEqual(['2026-09-16T13:30:00+03:00', '2026-10-15T13:30:00+03:00']);
    expect(findOccurrences('14 Ekim Çarşamba, 20:00 | Müze Gazhane', now)).toEqual([{ start: '2026-10-14T20:00:00+03:00' }]);
    expect(findOccurrences('11 Ekim 2026 Pazar | 17:30 | ARTER', now)).toEqual([{ start: '2026-10-11T17:30:00+03:00' }]);
    expect(findOccurrences('22 Ekim 2026 | Ana Sayfa', now)).toEqual([{ start: '2026-10-22T00:00:00+03:00', allDay: true }]);
    expect(findOccurrences('24.10.2026 19:30', now)).toEqual([{ start: '2026-10-24T19:30:00+03:00' }]);
  });

  it('treats ranges as one all-day run', () => {
    expect(findOccurrences('16 Eyl 2026 – 14 Mar 2027', now)).toEqual([{ start: '2026-09-16T00:00:00+03:00', end: '2027-03-14T23:59:00+03:00', allDay: true }]);
    expect(findOccurrences('22 Ocak–22 Kasım 2026', now)).toEqual([{ start: '2026-01-22T00:00:00+03:00', end: '2026-11-22T23:59:00+03:00', allDay: true }]);
  });

  it('infers the year for dates without one', () => {
    expect(inferYear(1, 15, now)).toBe(2027);
    expect(inferYear(10, 14, now)).toBe(2026);
    expect(inferYear(9, 20, now)).toBe(2026);
  });

  it('categories, price, free, title, tickets', () => {
    expect(guessCategory('Burcu Ural Kopan ile Kitap Okuma Atölyesi')).toBe('workshop');
    expect(guessCategory('Off the Record', 'Söyleşi')).toBe('talk');
    expect(isFree('Etkinlik ücretsizdir.')).toBe(true);
    expect(priceIn('Tam | 850,00 TL | Öğrenci')).toBe('850,00 TL');
    expect(pageTitle('<html><h1> Oscar </h1></html>')).toBe('Oscar');
    expect(ticketLink('<a href="https://www.biletix.com/x">Bilet</a><a href="/bilet/12">Bilet al</a>', 'https://v.example/a')).toBe('https://v.example/bilet/12');
    expect(htmlToText('<p>A</p><script>x</script><p>B</p>')).toBe('A | B |');
  });

  it('date lists and runs (Arter)', () => {
    expect(parseDateList('19/20/21 Kasım 2026', now).map((o) => o.start.slice(0, 10))).toEqual(['2026-11-19', '2026-11-20', '2026-11-21']);
    expect(parseDateList('3, 10 Kasım, 1 ve 8 Aralık 2026', now).map((o) => o.start.slice(0, 10))).toEqual(['2026-11-03', '2026-11-10', '2026-12-01', '2026-12-08']);
    expect(parseDateList("15 Kasım 2026'ya kadar", now)).toEqual([{ start: '2026-10-11T00:00:00+03:00', end: '2026-11-15T23:59:00+03:00', allDay: true }]);
    expect(parseDateList('Her Perşembe', now)).toEqual([]);
    expect(norm('Kağıthane Sadabad Sahnesi')).toBe('kagithane sadabad sahnesi');
  });
});
