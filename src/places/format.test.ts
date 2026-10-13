import { describe, expect, it } from 'vitest';
import { cleanName, fixCaps, formatCuisine, formatPhone, joinList, phoneList, telHref } from './format';

describe('semicolon lists', () => {
  it('joins with ", "', () => {
    expect(joinList('National Palaces Painting Museum;Painting Museum')).toBe('National Palaces Painting Museum, Painting Museum');
    expect(joinList('A; B ;;C')).toBe('A, B, C');
    expect(joinList('Same;Same')).toBe('Same');
    expect(joinList('')).toBe('');
    expect(joinList('No list here')).toBe('No list here');
  });
});

describe('ALL-CAPS names (Turkish-aware)', () => {
  it('title-cases with Turkish rules in the Turkish UI', () => {
    expect(fixCaps('GÜNGÖREN', 'tr')).toBe('Güngören');
    expect(fixCaps('IŞIK ÜNİVERSİTESİ', 'tr')).toBe('Işık Üniversitesi');
    expect(fixCaps('İSTİKLAL CADDESİ', 'tr')).toBe('İstiklal Caddesi');
    expect(fixCaps('KADIKÖY BELEDİYESİ', 'tr')).toBe('Kadıköy Belediyesi');
  });

  it('title-cases with English rules otherwise (no stray combining dot from İ)', () => {
    expect(fixCaps('GÜNGÖREN', 'en')).toBe('Güngören');
    const r = fixCaps('İSTANBUL MODERN', 'en');
    expect(r).toBe('Istanbul Modern'); // English casing: İ → i → I
    expect(r).not.toMatch(/̇/);
    expect(fixCaps('BEŞİKTAŞ', 'en')).toBe('Beşiktaş');
  });

  it('keeps short acronyms and mixed-case names untouched; lowers connectors', () => {
    for (const s of ['AKM', 'BKM', 'SALT', 'IKSV', 'Salt Galata', 'Kadıköy', 'moda', '']) expect(fixCaps(s, 'tr')).toBe(s);
    expect(fixCaps('KADIKÖY VE MODA', 'tr')).toBe('Kadıköy ve Moda');
    expect(fixCaps('TRT MÜZESİ', 'tr')).toBe('TRT Müzesi');
    expect(fixCaps('ATATÜRK PARKI 2', 'tr')).toBe('Atatürk Parkı 2');
    expect(fixCaps('KADIKÖY-MODA SAHİLİ', 'tr')).toBe('Kadıköy-Moda Sahili');
  });

  it('cleanName joins lists and fixes caps; empty in, empty out', () => {
    expect(cleanName('GÜNGÖREN', 'tr')).toBe('Güngören');
    expect(cleanName('Painting Museum;Museum', 'en')).toBe('Painting Museum, Museum');
    expect(cleanName(null, 'en')).toBe('');
    expect(cleanName(undefined, 'tr')).toBe('');
  });
});

describe('cuisine', () => {
  it('capitalises each value and splits lists', () => {
    expect(formatCuisine('turkish', 'en')).toBe('Turkish');
    expect(formatCuisine('turkish;kebab', 'en')).toBe('Turkish, Kebab');
    expect(formatCuisine('italian_pizza', 'en')).toBe('Italian pizza');
    expect(formatCuisine(' regional ; seafood ', 'tr')).toBe('Regional, Seafood');
    expect(formatCuisine(null, 'en')).toBe('');
  });
  it('English OSM keys keep English casing in the Turkish UI (no "İtalian")', () => {
    expect(formatCuisine('italian', 'tr')).toBe('Italian');
    expect(formatCuisine('ıspanak', 'tr')).toBe('Ispanak'); // a Turkish-letter value gets Turkish casing: ı → I
    expect(formatCuisine('izgara', 'tr')).toBe('Izgara');
  });
});

describe('Turkish phone numbers', () => {
  it('formats mobile and landline numbers the same way', () => {
    for (const raw of ['+905050962623', '+90 505 096 26 23', '05050962623', '0 505 096 26 23', '905050962623', '5050962623', '0090 505 096 2623', '+90 (505) 096-26-23']) expect(formatPhone(raw)).toBe('+90 505 096 26 23');
    expect(formatPhone('+902122451234')).toBe('+90 212 245 12 34');
    expect(formatPhone('(0212) 245 12 34')).toBe('+90 212 245 12 34');
    expect(formatPhone('0850 222 33 44')).toBe('+90 850 222 33 44');
  });

  it('leaves what it cannot read with confidence', () => {
    for (const raw of ['+49 30 123456', '444 1 234', '245 12 34', '+90 505 096', '12345', 'abc', '+9005050962623']) expect(formatPhone(raw)).toBe(raw);
  });

  it('lists and tel links', () => {
    expect(phoneList('+902122451234;+905050962623')).toEqual(['+90 212 245 12 34', '+90 505 096 26 23']);
    expect(phoneList(null)).toEqual([]);
    expect(telHref('+90 505 096 26 23')).toBe('tel:+905050962623');
  });
});
