import { CONFIG } from '../config';

export interface FpsReading {
  fps: number;
  /** Lowest windowed fps over the last `fpsMinWindowMs`. */
  minFps: number;
  /** Worst single frame time in the current window (ms). */
  worstFrameMs: number;
}

/** rAF-based frame-rate meter. Calls `onReading` once per sampling window. */
export function startFpsMeter(onReading: (r: FpsReading) => void): () => void {
  const { fpsWindowMs, fpsMinWindowMs } = CONFIG.debug;
  let frames = 0;
  let windowStart = performance.now();
  let last = windowStart;
  let worst = 0;
  const history: { t: number; fps: number }[] = [];
  let raf = 0;

  const tick = (now: number) => {
    frames++;
    worst = Math.max(worst, now - last);
    last = now;
    const elapsed = now - windowStart;
    if (elapsed >= fpsWindowMs) {
      const fps = (frames * 1000) / elapsed;
      history.push({ t: now, fps });
      while (history.length && now - history[0].t > fpsMinWindowMs) history.shift();
      onReading({ fps, minFps: Math.min(...history.map((h) => h.fps)), worstFrameMs: worst });
      frames = 0;
      worst = 0;
      windowStart = now;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
