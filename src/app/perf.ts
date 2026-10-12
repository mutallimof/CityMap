import type { Map as MlMap } from 'maplibre-gl';
import { CONFIG } from '../config';
import { startFpsMeter } from '../debug/fps';

/** What a quality step changes beyond resolution (the effects layers read these). */
export interface QualityKnobs {
  /** 0–1 share of rain drops / snowflakes. */
  particles: number;
  /** Lit-window pattern on buildings at night (a second extrusion pass). */
  windows: boolean;
  /** 3D buildings at all (flat ground colours remain). */
  buildings: boolean;
  /** Seagulls. */
  gulls: boolean;
  /** Share of the toy scenery's 3D trees kept (themes with style.trees3d). */
  trees: number;
}

export type Step = { kind: 'ratio'; value: number } | { kind: 'effects'; knobs: Partial<QualityKnobs>; label: string };

/** The ladder: first resolution, then effects, cheapest-to-lose first. Pure. */
export function qualityLadder(currentRatio: number): Step[] {
  const p = CONFIG.perf;
  return [
    ...p.pixelRatioSteps.filter((r) => r < currentRatio).map((value) => ({ kind: 'ratio' as const, value })),
    { kind: 'effects', knobs: { particles: 0.45, gulls: false, trees: 0.5 }, label: 'fewer particles and trees, no gulls' },
    { kind: 'effects', knobs: { windows: false }, label: 'no lit-window pass' },
    { kind: 'effects', knobs: { trees: 0 }, label: 'no 3D trees' },
    { kind: 'effects', knobs: { buildings: false, particles: 0.25 }, label: 'flat buildings' },
  ];
}

/** Rough first guess from the device so weak phones don't start at full tilt. */
export function lowEndDevice(): boolean {
  const n = navigator as Navigator & { deviceMemory?: number };
  return (n.hardwareConcurrency ?? 8) <= 4 || (n.deviceMemory ?? 8) <= 3;
}

/**
 * Adaptive quality: while the frame rate stays below target, walk down the ladder — resolution
 * (2 → 1.5 → 1.25 → 1; the water shader and wakes are fill-rate bound), then particles / gulls,
 * the night window pass, finally 3D buildings. Never steps back up within a session —
 * oscillating looks worse than a slightly calmer scene.
 */
export function startAdaptiveQuality(map: MlMap, apply: (k: Partial<QualityKnobs>) => void): void {
  const p = CONFIG.perf;
  if (lowEndDevice() && map.getPixelRatio() > 1.5) map.setPixelRatio(1.5);
  const steps = qualityLadder(map.getPixelRatio());
  let lowSince = 0;
  startFpsMeter(({ fps }) => {
    if (document.hidden || map.isMoving()) return (lowSince = 0), undefined;
    const now = performance.now();
    if (fps < p.minFps) {
      lowSince ||= now;
      if (now - lowSince > p.lowForMs && steps.length) {
        const next = steps.shift()!;
        if (next.kind === 'ratio') map.setPixelRatio(next.value);
        else apply(next.knobs);
        console.info(`adaptive quality: ${next.kind === 'ratio' ? `pixel ratio → ${next.value}` : next.label} (fps ${fps.toFixed(0)})`);
        lowSince = 0;
      }
    } else lowSince = 0;
  });
}
