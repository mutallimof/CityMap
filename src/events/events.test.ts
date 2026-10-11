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
