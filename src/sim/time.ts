import { CONFIG } from '../config';

export const DAY_S = 86_400;

/** "HH:MM" → seconds since midnight. */
export function parseHHMM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`Bad time "${s}"`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
}

export function formatHHMM(seconds: number): string {
  const s = ((Math.floor(seconds) % DAY_S) + DAY_S) % DAY_S;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

export interface LocalTime {
  /** Days since 1970-01-01 in Istanbul local time. */
  day: number;
  /** Seconds since local midnight, [0, 86400). */
  seconds: number;
}

/** Epoch ms → Istanbul local day + seconds. Fixed offset (Turkey has no DST). */
export function toIstanbul(epochMs: number, offsetHours = CONFIG.sim.utcOffsetHours): LocalTime {
  const localS = epochMs / 1000 + offsetHours * 3600;
  const day = Math.floor(localS / DAY_S);
  return { day, seconds: localS - day * DAY_S };
}

export function fromIstanbul({ day, seconds }: LocalTime, offsetHours = CONFIG.sim.utcOffsetHours): number {
  return (day * DAY_S + seconds - offsetHours * 3600) * 1000;
}

/**
 * Simulation clock: sim time advances at `speed`× real time from an anchor.
 * Pure — callers pass the real `now`; changing speed re-anchors so time never jumps.
 */
export interface SimClock {
  anchorRealMs: number;
  anchorSimMs: number;
  speed: number;
}

export function simNow(clock: SimClock, realNowMs: number): number {
  return clock.anchorSimMs + (realNowMs - clock.anchorRealMs) * clock.speed;
}

export function withSpeed(clock: SimClock, speed: number, realNowMs: number): SimClock {
  return { anchorRealMs: realNowMs, anchorSimMs: simNow(clock, realNowMs), speed };
}

export function jumpTo(clock: SimClock, simMs: number, realNowMs: number): SimClock {
  return { ...clock, anchorRealMs: realNowMs, anchorSimMs: simMs };
}
