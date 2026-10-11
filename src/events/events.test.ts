import { describe, expect, it } from 'vitest';
import { EventsStore, isNow, isToday, matches, NO_EVENT_FILTERS, weekendRange, type CityEvent } from './events';

// Wednesday 2026-10-14 15:00 Istanbul
const now = Date.parse('2026-10-14T15:00:00+03:00');
const ev = (o: Partial<CityEvent>): CityEvent => ({ id: 'x', venue: 'v', place: 'p', title: 'T', start: '2026-10-14T20:00:00+03:00', category: 'concert', url: 'https://a.example', ...o });

describe('events', () => {
  it('today / now', () => {
    expect(isToday(ev({}), now)).toBe(true);
    expect(isNow(ev({}), now)).toBe(false);
    expect(isNow(ev({ start: '2026-10-14T14:30:00+03:00' }), now)).toBe(true);
    expect(isToday(ev({ start: '2026-10-15T10:00:00+03:00' }), now)).toBe(false);
    // a months-long exhibition never makes the venue glow
    expect(isToday(ev({ start: '2026-09-01T00:00:00+03:00', end: '2027-01-31T23:59:00+03:00', allDay: true, category: 'exhibition' }), now)).toBe(false);
  });

  it('weekend is the coming Saturday–Sunday', () => {
    const [s, e] = weekendRange(now);
    expect(new Date(s).toISOString()).toBe('2026-10-16T21:00:00.000Z');
    expect(new Date(e).toISOString()).toBe('2026-10-18T20:59:59.999Z');
  });

  it('filters combine: time window OR, attributes AND', () => {
    const sat = ev({ start: '2026-10-17T11:00:00+03:00', category: 'workshop', free: true });
    expect(matches(sat, { ...NO_EVENT_FILTERS, weekend: true }, now)).toBe(true);
    expect(matches(sat, { ...NO_EVENT_FILTERS, today: true }, now)).toBe(false);
    expect(matches(sat, { ...NO_EVENT_FILTERS, today: true, weekend: true }, now)).toBe(true);
    expect(matches(sat, { ...NO_EVENT_FILTERS, workshops: true, free: true }, now)).toBe(true);
    expect(matches(ev({}), { ...NO_EVENT_FILTERS, free: true }, now)).toBe(false);
    expect(matches(ev({ start: '2026-10-13T20:00:00+03:00' }), NO_EVENT_FILTERS, now)).toBe(false); // over
  });

  it('store: status and upcoming per place', () => {
    const s = new EventsStore();
    s.set([ev({ id: 'a', start: '2026-10-14T14:30:00+03:00' }), ev({ id: 'b' }), ev({ id: 'c', place: 'q', start: '2026-10-20T20:00:00+03:00' })]);
    expect(s.status('p', now)).toBe('now');
    expect(s.status('q', now)).toBeNull();
    expect(s.upcoming('p', now).map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('glow and pulse rules (an event tomorrow never glows or pulses)', () => {
  const ev = (start: string, extra: Partial<CityEvent> = {}): CityEvent => ({ id: start, venue: 'v', place: 'p', title: 't', start, category: 'concert', url: 'https://x.org', ...extra });
  const at = (iso: string) => Date.parse(iso);
  it('tomorrow evening: neither today nor now, the evening before or just before midnight', () => {
    const e = ev('2026-10-12T21:00:00+03:00');
    for (const t of ['2026-10-11T21:15:00+03:00', '2026-10-11T23:59:00+03:00']) {
      expect(isToday(e, at(t))).toBe(false);
      expect(isNow(e, at(t))).toBe(false);
    }
    const store = new EventsStore();
    store.set([e]);
    expect(store.status('p', at('2026-10-11T21:15:00+03:00'))).toBeNull();
    expect(store.status('p', at('2026-10-12T09:00:00+03:00'))).toBe('today');
    expect(store.status('p', at('2026-10-12T21:30:00+03:00'))).toBe('now');
    expect(store.status('p', at('2026-10-12T23:30:00+03:00'))).toBeNull(); // over (2 h default)
  });
  it('an all-day event tomorrow does not glow today; long runs never glow or pulse', () => {
    expect(isToday(ev('2026-10-12T00:00:00+03:00', { allDay: true }), at('2026-10-11T20:00:00+03:00'))).toBe(false);
    const run = ev('2026-10-01T10:00:00+03:00', { end: '2026-10-30T18:00:00+03:00' });
    expect(isToday(run, at('2026-10-11T12:00:00+03:00')) || isNow(run, at('2026-10-11T12:00:00+03:00'))).toBe(false);
  });
});
