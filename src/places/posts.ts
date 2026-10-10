import { fromIstanbul, parseHHMM, toIstanbul } from '../sim/time';
import type { Post, RawPost } from './types';

/** Hours a post counts as "new" (its pin gets the story ring + glow). */
export const NEW_HOURS = 6;

/**
 * Resolve relative demo timings against the simulated clock: events happen "today" (+ dayOffset)
 * at their start time; "@sunset-30" means 30 minutes before today's sunset. The posted time is
 * relative to *now*, so there is always fresh content. Pure.
 */
export function resolvePost(p: RawPost, nowMs: number, sunsetMs: number | null): Post {
  const today = toIstanbul(nowMs).day;
  const out: Post = { ...p, postedAt: nowMs - p.postedHoursAgo * 3_600_000 };
  if (p.type === 'event' && p.start) {
    let startMs: number;
    const sun = /^@sunset([+-]\d+)?$/.exec(p.start);
    if (sun) startMs = (sunsetMs ?? fromIstanbul({ day: today, seconds: 18.5 * 3600 })) + Number(sun[1] ?? 0) * 60_000;
    else startMs = fromIstanbul({ day: today + (p.dayOffset ?? 0), seconds: parseHHMM(p.start) });
    if (sun) startMs += (p.dayOffset ?? 0) * 86_400_000;
    out.startsAt = startMs;
    out.endsAt = startMs + (p.durationMin ?? 90) * 60_000;
  }
  if (p.type === 'offer') out.validUntil = fromIstanbul({ day: today + (p.validDays ?? 1), seconds: 0 });
  return out;
}

export function isNew(p: Post, nowMs: number): boolean {
  return nowMs - p.postedAt < NEW_HOURS * 3_600_000;
}

/** Happening now. */
export function isLive(p: Post, nowMs: number): boolean {
  return p.startsAt !== undefined && p.endsAt !== undefined && nowMs >= p.startsAt && nowMs < p.endsAt;
}

/** Starts within the next 2 hours. */
export function isSoon(p: Post, nowMs: number): boolean {
  return p.startsAt !== undefined && p.startsAt > nowMs && p.startsAt - nowMs < 2 * 3_600_000;
}

/**
 * "Tonight": an event that is on now or starts between now and 04:00, and finishes after 17:00
 * today (so a morning class isn't "tonight").
 */
export function isTonight(p: Post, nowMs: number): boolean {
  if (p.startsAt === undefined || p.endsAt === undefined) return false;
  const day = toIstanbul(nowMs).day;
  const evening = fromIstanbul({ day, seconds: 17 * 3600 });
  const lateNight = fromIstanbul({ day: day + 1, seconds: 4 * 3600 });
  return p.endsAt > Math.max(nowMs, evening) && p.startsAt < lateNight;
}

export function isExpired(p: Post, nowMs: number): boolean {
  if (p.endsAt !== undefined) return p.endsAt < nowMs;
  if (p.validUntil !== undefined) return p.validUntil < nowMs;
  return false;
}

/** Feed order: live events, soon events, then newest first. */
export function feedRank(p: Post, nowMs: number): number {
  if (isLive(p, nowMs)) return 3e12 + p.startsAt!;
  if (isSoon(p, nowMs)) return 2e12 - p.startsAt!;
  return p.postedAt / 1000;
}
