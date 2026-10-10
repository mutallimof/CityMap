import { describe, expect, it } from 'vitest';
import { fromIstanbul } from '../sim/time';
import { feedRank, isExpired, isLive, isNew, isSoon, isTonight, resolvePost } from './posts';
import type { RawPost } from './types';

const DAY = 20_000;
const at = (h: number, m = 0, d = DAY) => fromIstanbul({ day: d, seconds: h * 3600 + m * 60 });
const base = { placeId: 'x', title: { tr: '', en: '' }, body: { tr: '', en: '' }, demo: true as const };
const ev = (start: string, extra: Partial<RawPost> = {}): RawPost => ({ ...base, id: start, type: 'event', start, durationMin: 120, postedHoursAgo: 2, ...extra });

describe('demo posts', () => {
  it('resolves event times on today (+ offset) and sunset-relative starts', () => {
    const now = at(15);
    expect(resolvePost(ev('20:30'), now, null).startsAt).toBe(at(20, 30));
    expect(resolvePost(ev('10:00', { dayOffset: 1 }), now, null).startsAt).toBe(at(10, 0, DAY + 1));
    expect(resolvePost(ev('@sunset-30'), now, at(18, 40)).startsAt).toBe(at(18, 10));
  });

  it('classifies new / live / soon / tonight / expired', () => {
    const now = at(19, 30);
    const p = resolvePost(ev('20:30'), now, null);
    expect(isNew(p, now)).toBe(true);
    expect(isSoon(p, now)).toBe(true);
    expect(isLive(p, now)).toBe(false);
    expect(isTonight(p, now)).toBe(true);
    expect(isLive(p, at(21))).toBe(true);
    expect(isExpired(p, at(23))).toBe(true);
    const morning = resolvePost(ev('09:00', { durationMin: 60 }), at(8), null);
    expect(isTonight(morning, at(8))).toBe(false);
    const tomorrow = resolvePost(ev('20:00', { dayOffset: 1 }), now, null);
    expect(isTonight(tomorrow, now)).toBe(false);
  });

  it('ranks live first, then soon, then newest', () => {
    const now = at(20, 45);
    const live = resolvePost(ev('20:30'), now, null);
    const soon = resolvePost(ev('21:30'), now, null);
    const news = resolvePost({ ...base, id: 'n', type: 'news', postedHoursAgo: 0.1 }, now, null);
    const ranked = [news, soon, live].sort((a, b) => feedRank(b, now) - feedRank(a, now));
    expect(ranked.map((p) => p.id)).toEqual(['20:30', '21:30', 'n']);
  });
});
