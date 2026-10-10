import type { Map as MlMap } from 'maplibre-gl';
import { CONFIG } from '../config';
import { startFpsMeter } from '../debug/fps';

/**
 * Adaptive resolution: if the frame rate stays below target, step the render pixel ratio down
 * (2 → 1.5 → 1.25 → 1). Never steps back up within a session — oscillating looks worse than a
 * slightly softer image. The water shader and wakes are fill-rate bound, so this is the big lever.
 */
export function startAdaptiveQuality(map: MlMap): void {
  const p = CONFIG.perf;
  const steps = p.pixelRatioSteps.filter((r) => r < map.getPixelRatio());
  let lowSince = 0;
  startFpsMeter(({ fps }) => {
    if (document.hidden || map.isMoving()) return (lowSince = 0), undefined;
    const now = performance.now();
    if (fps < p.minFps) {
      lowSince ||= now;
      if (now - lowSince > p.lowForMs && steps.length) {
        const next = steps.shift()!;
        map.setPixelRatio(next);
        console.info(`adaptive quality: pixel ratio → ${next} (fps ${fps.toFixed(0)})`);
        lowSince = 0;
      }
    } else lowSince = 0;
  });
}
