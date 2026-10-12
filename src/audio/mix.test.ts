import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { HornGate, mixFor, nextGapS, type MixInput } from './mix';

const base: MixInput = { night: 0, zoom: 16, water: 0.6, rain: 0, snow: 0, fog: 0, thunder: 0, windMs: 3 };
const at = (o: Partial<MixInput>) => mixFor({ ...base, ...o });

describe('mix: time of day', () => {
  it('day on the shore is the busy harbour; night is quiet lapping water', () => {
    const day = at({ night: 0 });
    const night = at({ night: 1 });
    expect(day.beds.harbour).toBeGreaterThan(0.3);
    expect(night.beds.harbour).toBe(0);
    expect(night.beds.water).toBeGreaterThan(day.beds.water);
    expect(night.gullsPerMin).toBeLessThan(day.gullsPerMin / 4);
  });
  it('dusk sits between the two (crossfade, no jump)', () => {
    const d = at({ night: 0 }).beds.harbour;
    const m = at({ night: 0.5 }).beds.harbour;
    const n = at({ night: 1 }).beds.harbour;
    expect(m).toBeLessThan(d);
    expect(m).toBeGreaterThan(n);
  });
});

describe('mix: zoom and place', () => {
  it('zoomed out is mostly the soft city hum', () => {
    const m = at({ zoom: 10 });
    expect(m.beds.hum).toBeGreaterThan(0.3);
    expect(m.beds.street).toBe(0);
    expect(m.beds.hum).toBeGreaterThan(m.beds.harbour * 2);
    expect(m.oneShotLevel).toBeLessThan(at({ zoom: 16 }).oneShotLevel);
  });
  it('zoomed in by the water: waves, gulls, harbour; no street', () => {
    const m = at({ zoom: 16, water: 0.9 });
    expect(m.beds.harbour).toBeGreaterThan(m.beds.street * 5);
    expect(m.beds.water).toBeGreaterThan(0.1);
    expect(m.gullsPerMin).toBeGreaterThan(1.5);
    expect(m.piersPerMin).toBeGreaterThan(0.2);
  });
  it('zoomed in inland: street / café, quieter water, few gulls', () => {
    const shore = at({ zoom: 16, water: 0.9 });
    const inland = at({ zoom: 16, water: 0 });
    expect(inland.beds.street).toBeGreaterThan(0.4);
    expect(inland.beds.water).toBeLessThan(shore.beds.water);
    expect(inland.beds.harbour).toBe(0);
    expect(inland.gullsPerMin).toBeLessThan(shore.gullsPerMin / 3);
    expect(inland.piersPerMin).toBe(0);
  });
});

describe('mix: weather', () => {
  it('clear weather: no rain or wind bed, open filter', () => {
    const m = at({});
    expect(m.beds.rain).toBe(0);
    expect(m.beds.wind).toBe(0);
    expect(m.lowpassHz).toBeCloseTo(CONFIG.sound.openHz);
  });
  it('rain brings the rain bed and pushes the city back', () => {
    const m = at({ rain: 1 });
    expect(m.beds.rain).toBeGreaterThan(0.5);
    expect(m.beds.harbour).toBeLessThan(at({}).beds.harbour);
    expect(m.gullsPerMin).toBeLessThan(at({}).gullsPerMin / 3);
  });
  it('wind/storm brings the wind bed, stronger with speed', () => {
    expect(at({ windMs: 9 }).beds.wind).toBeGreaterThan(0);
    expect(at({ windMs: 16 }).beds.wind).toBeGreaterThan(at({ windMs: 9 }).beds.wind);
    expect(at({ thunder: 1 }).beds.rain).toBeGreaterThan(0);
  });
  it('fog muffles; snow muffles and quietens', () => {
    expect(at({ fog: 1 }).lowpassHz).toBeCloseTo(CONFIG.sound.mutedHz);
    expect(at({ fog: 1 }).foghornsPerMin).toBeGreaterThan(0);
    expect(at({}).foghornsPerMin).toBe(0);
    const snow = at({ snow: 1 });
    expect(snow.lowpassHz).toBeLessThan(3000);
    expect(snow.beds.harbour).toBeLessThan(at({}).beds.harbour / 2);
    expect(snow.gullsPerMin).toBeLessThan(at({}).gullsPerMin / 4);
  });
  it('every level stays within 0..1', () => {
    for (const night of [0, 1])
      for (const zoom of [8, 12, 18])
        for (const w of [0, 1])
          for (const r of [0, 1]) {
            const m = mixFor({ night, zoom, water: w, rain: r, snow: r, fog: r, thunder: r, windMs: r * 30 });
            for (const v of Object.values(m.beds)) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
          }
  });
});

describe('horns', () => {
  it('only real departures, only near the view', () => {
    const g = new HornGate();
    expect(g.level(false, 100, 15, 0)).toBe(0);
    expect(g.level(true, 50_000, 15, 0)).toBe(0);
    expect(g.level(true, 100, 15, 0)).toBeGreaterThan(0);
  });
  it('never more than one every hornGapS seconds', () => {
    const g = new HornGate();
    let n = 0;
    // A departure every 3 s for 10 minutes.
    for (let t = 0; t < 600; t += 3) if (g.level(true, 200, 15, t) > 0) n++;
    expect(n).toBeLessThanOrEqual(Math.ceil(600 / CONFIG.sound.hornGapS));
    expect(n).toBeGreaterThan(600 / CONFIG.sound.hornGapS / 2);
    const g2 = new HornGate();
    expect(g2.level(true, 200, 15, 100)).toBeGreaterThan(0);
    expect(g2.level(true, 200, 15, 100 + CONFIG.sound.hornGapS - 0.1)).toBe(0);
    expect(g2.level(true, 200, 15, 100 + CONFIG.sound.hornGapS)).toBeGreaterThan(0);
  });
  it('a refused far-away horn does not use up the slot', () => {
    const g = new HornGate();
    expect(g.level(true, 50_000, 15, 0)).toBe(0);
    expect(g.level(true, 100, 15, 1)).toBeGreaterThan(0);
  });
});

describe('one-shot timing', () => {
  it('is random but never too close; none at rate 0', () => {
    expect(nextGapS(0, 0.5, 4)).toBe(Infinity);
    expect(nextGapS(60, 0.0001, 4)).toBe(4);
    expect(nextGapS(2, 0.5, 4)).toBeCloseTo(-Math.log(0.5) * 30);
  });
});
