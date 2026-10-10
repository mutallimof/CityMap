import type { Map as MlMap } from 'maplibre-gl';
import { CONFIG } from '../config';
import { startFpsMeter } from './fps';
import type { ClockController } from '../app/clock';
import { formatHHMM, toIstanbul } from '../sim/time';

export interface DebugSources {
  clock: ClockController;
  vesselCount: () => number;
}

function initiallyEnabled(): boolean {
  const q = new URLSearchParams(location.search).get('debug');
  if (q !== null) return q !== '0';
  return import.meta.env.DEV && CONFIG.debug.enabledInDev;
}

/**
 * Small corner panel: fps, min fps, worst frame, camera, sim clock.
 * Keys: ` toggle panel · s cycle sim speed (1×/10×/60×) · n back to now.
 */
export function mountDebugPanel(map: MlMap, src: DebugSources): void {
  const el = document.createElement('div');
  el.className = 'debug-panel';
  document.body.appendChild(el);

  let visible = initiallyEnabled();
  let stop: (() => void) | null = null;

  const render = (fps: number, minFps: number, worst: number) => {
    const c = map.getCenter();
    el.innerHTML =
      `<b class="${fps < 45 ? 'bad' : fps < 58 ? 'warn' : 'ok'}">${fps.toFixed(0)} fps</b>` +
      ` · min ${minFps.toFixed(0)} · worst ${worst.toFixed(0)} ms<br>` +
      `z ${map.getZoom().toFixed(2)} · pitch ${map.getPitch().toFixed(0)}° · bearing ${map.getBearing().toFixed(0)}°<br>` +
      `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}<br>` +
      `sim ${formatHHMM(toIstanbul(src.clock.now()).seconds)} · ${src.clock.speed}× · ${src.vesselCount()} vessels`;
  };

  const apply = () => {
    el.hidden = !visible;
    if (visible && !stop) stop = startFpsMeter((r) => render(r.fps, r.minFps, r.worstFrameMs));
    if (!visible && stop) {
      stop();
      stop = null;
    }
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === '`') {
      visible = !visible;
      apply();
    }
    if (e.key === 's') src.clock.cycleSpeed();
    if (e.key === 'n') src.clock.resetToNow();
  });
  apply();
}
