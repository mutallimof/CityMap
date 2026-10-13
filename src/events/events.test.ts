import { describe, expect, it } from 'vitest';
import { EventsStore, formatUpdated, freshEvents, isNow, STALE_VENUE_MS, isToday, matches, NO_EVENT_FILTERS, weekendRange, type CityEvent } from './events';

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

describe('stale venues', () => {
  const D = 86_400_000;
  const fresh = ev({ id: 'a', venue: 'fresh', place: 'pa' });
  const stale = ev({ id: 'b', venue: 'stale', place: 'pb' });
  const blocked = ev({ id: 'c', venue: 'kept-while-blocked', place: 'pc' });
  const file = {
    generated: new Date(now - 3_600_000).toISOString(),
    venues: { fresh: new Date(now - 3_600_000).toISOString(), stale: new Date(now - 3 * D - 60_000).toISOString(), 'kept-while-blocked': new Date(now - 10 * D).toISOString() },
    events: [fresh, stale, blocked],
  };

  it('hides events of venues last refreshed more than 3 days ago', () => {
    expect(STALE_VENUE_MS).toBe(3 * D);
    expect(freshEvents(file, now).map((e) => e.id)).toEqual(['a']);
  });

  it('exactly 3 days is still shown', () => {
    const f = { ...file, venues: { ...file.venues, stale: new Date(now - 3 * D).toISOString() } };
    expect(freshEvents(f, now).map((e) => e.id)).toContain('b');
  });

  it('old files without per-venue times show everything; so do venues without an entry or a valid time', () => {
    expect(freshEvents({ generated: 'x', events: file.events }, now)).toHaveLength(3);
    expect(freshEvents({ events: file.events }, now)).toHaveLength(3);
    expect(freshEvents({ ...file, venues: { stale: 'garbage' } }, now)).toHaveLength(3);
    expect(freshEvents({ ...file, venues: {} }, now)).toHaveLength(3);
  });

  it('never throws on a broken file', () => {
    expect(freshEvents(null, now)).toEqual([]);
    expect(freshEvents(undefined, now)).toEqual([]);
    expect(freshEvents({ events: 'nope' as never }, now)).toEqual([]);
    expect(freshEvents({ venues: null as never, events: [fresh] }, now)).toEqual([fresh]);
  });

  it('the store drops stale venues, keeps the generated stamp, and tolerates old files', () => {
    const s = new EventsStore();
    s.setFile(file, now);
    expect(s.all.map((e) => e.id)).toEqual(['a']);
    expect(s.upcoming('pb', now)).toEqual([]);
    expect(s.generated).toBe(file.generated);
    s.setFile({ events: [fresh, stale] }, now);
    expect(s.all).toHaveLength(2);
    expect(s.generated).toBeNull();
  });

  it('formats the updated date per language (Istanbul calendar day)', () => {
    expect(formatUpdated('2026-10-12T11:56:04.023Z', 'en')).toBe('12 October 2026');
    expect(formatUpdated('2026-10-12T11:56:04.023Z', 'tr')).toBe('12 Ekim 2026');
    expect(formatUpdated('2026-10-12T22:30:00Z', 'en')).toBe('13 October 2026'); // already the 13th in Istanbul
    expect(formatUpdated(null, 'en')).toBeNull();
    expect(formatUpdated('nonsense', 'tr')).toBeNull();
  });
});

describe('venues without events (blocked from the runners, no dates published)', () => {
  it('a place with no events has no events UI: nothing upcoming, no status, no filter match', () => {
    const s = new EventsStore();
    s.setFile({ generated: '2026-10-12T11:56:04.023Z', venues: { fresh: '2026-10-12T11:56:04.023Z' }, events: [ev({ venue: 'fresh', place: 'pa' })] }, now);
    for (const place of ['moda-sahnesi', 'crr', 'zorlu-psm', 'ibb-kultur']) {
      expect(s.upcoming(place, now)).toEqual([]);
      expect(s.status(place, now)).toBeNull();
      expect(s.placeMatches(place, { ...NO_EVENT_FILTERS, today: true }, now)).toBe(false);
    }
    expect(s.places()).toEqual(['pa']);
  });
});
