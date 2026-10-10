/**
 * Motion along one leg (pier → pier). Velocity ramps with a raised-cosine curve over
 * `ramp` seconds at both ends, cruising in between. Velocity AND acceleration are
 * continuous (zero acceleration at the ramp edges), so nothing jerks.
 * Legs too short to reach cruise speed use a lower peak speed with the same ramps.
 */
export interface LegProfile {
  length: number; // m
  peakSpeed: number; // m/s
  ramp: number; // s
  cruiseTime: number; // s
  duration: number; // s
}

export function legProfile(length: number, cruiseSpeed: number, ramp: number): LegProfile {
  if (length <= 0) return { length: 0, peakSpeed: 0, ramp, cruiseTime: 0, duration: 0 };
  // Distance covered by both ramps at speed v is v·ramp (each ramp covers v·ramp/2).
  if (length >= cruiseSpeed * ramp) {
    const cruiseTime = (length - cruiseSpeed * ramp) / cruiseSpeed;
    return { length, peakSpeed: cruiseSpeed, ramp, cruiseTime, duration: 2 * ramp + cruiseTime };
  }
  return { length, peakSpeed: length / ramp, ramp, cruiseTime: 0, duration: 2 * ramp };
}

function rampDistance(p: LegProfile, tau: number): number {
  const { peakSpeed: v, ramp: T } = p;
  return (v / 2) * (tau - (T / Math.PI) * Math.sin((Math.PI * tau) / T));
}

function rampSpeed(p: LegProfile, tau: number): number {
  return (p.peakSpeed / 2) * (1 - Math.cos((Math.PI * tau) / p.ramp));
}

/** Metres from the leg start after `t` seconds (clamped to [0, length]). */
export function distanceAt(p: LegProfile, t: number): number {
  if (p.duration === 0 || t <= 0) return 0;
  if (t >= p.duration) return p.length;
  if (t < p.ramp) return rampDistance(p, t);
  if (t < p.ramp + p.cruiseTime) return (p.peakSpeed * p.ramp) / 2 + p.peakSpeed * (t - p.ramp);
  return p.length - rampDistance(p, p.duration - t);
}

/** Speed (m/s) after `t` seconds. */
export function speedAt(p: LegProfile, t: number): number {
  if (p.duration === 0 || t <= 0 || t >= p.duration) return 0;
  if (t < p.ramp) return rampSpeed(p, t);
  if (t < p.ramp + p.cruiseTime) return p.peakSpeed;
  return rampSpeed(p, p.duration - t);
}

export const kmhToMs = (kmh: number) => kmh / 3.6;
