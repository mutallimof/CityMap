import { CONFIG } from '../config';
import { fromIstanbul, jumpTo, parseHHMM, simNow, toIstanbul, withSpeed, type SimClock } from '../sim/time';

/**
 * The app's one mutable simulation clock. Starts at real Istanbul time, 1×.
 * URL overrides for testing: ?speed=60, ?t=18:30 (Istanbul local) and ?date=2026-10-12 (default today).
 */
export class ClockController {
  private clock: SimClock;
  private listeners = new Set<() => void>();

  constructor() {
    const now = Date.now();
    this.clock = { anchorRealMs: now, anchorSimMs: now, speed: 1 };
    const q = new URLSearchParams(location.search);
    const t = q.get('t');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') ?? '') ? q.get('date')! : null;
    if (t || date) {
      const today = toIstanbul(now);
      const day = date ? Date.parse(`${date}T00:00:00Z`) / 86_400_000 : today.day;
      this.clock = jumpTo(this.clock, fromIstanbul({ day, seconds: t ? parseHHMM(t) : today.seconds }), now);
    }
    const speed = Number(q.get('speed'));
    if (speed > 0) this.clock = withSpeed(this.clock, speed, now);
  }

  /** Current simulated epoch ms. */
  now(realMs = Date.now()): number {
    return simNow(this.clock, realMs);
  }

  get speed(): number {
    return this.clock.speed;
  }

  setSpeed(speed: number): void {
    this.clock = withSpeed(this.clock, speed, Date.now());
    this.emit();
  }

  /** Jump back to real time (keeps the current speed). */
  resetToNow(): void {
    const now = Date.now();
    this.clock = jumpTo(this.clock, now, now);
    this.emit();
  }

  /** Jump to an absolute simulated time (keeps the current speed). */
  setSimTime(simMs: number): void {
    this.clock = jumpTo(this.clock, simMs, Date.now());
    this.emit();
  }

  /** Cycle through the configured speeds (1× → 10× → 60× → 1×). */
  cycleSpeed(): void {
    const speeds = CONFIG.sim.speeds;
    const i = speeds.indexOf(this.clock.speed as (typeof speeds)[number]);
    this.setSpeed(speeds[(i + 1) % speeds.length]);
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}
