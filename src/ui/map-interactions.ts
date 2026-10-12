import { look } from '../themes';
import type { ExpressionSpecification, MapMouseEvent } from 'maplibre-gl';
import { CONFIG } from '../config';
import { LAYER } from '../map/style';
import { sharedFrame } from '../three/context';
import { services } from './services';
import { ui, type Selection, type UiState } from './store';

/** Nearest vessel to a screen point within the tap radius (≥ 44 px hit area). */
function vesselAt(point: { x: number; y: number }): string | null {
  const { map, ferries } = services();
  let best: string | null = null;
  let bestD: number = CONFIG.selection.hitRadiusPx;
  for (const [id, d] of ferries.drawn) {
    const p = map.project(sharedFrame.lngLat([d.x, d.y]));
    const dist = Math.hypot(p.x - point.x, p.y - point.y);
    if (dist < bestD) {
      bestD = dist;
      best = id;
    }
  }
  return best;
}

let interceptor: ((point: { x: number; y: number }) => boolean) | null = null;
/** A tap handler that runs before everything else and swallows the tap when it returns true (gull facts). */
export function setTapInterceptor(fn: (point: { x: number; y: number }) => boolean): void {
  interceptor = fn;
}

let mapPick: ((lngLat: [number, number]) => void) | null = null;
/** While set, the next map tap picks a point (plan start / end) instead of selecting anything. */
export function setMapPick(fn: ((lngLat: [number, number]) => void) | null): void {
  mapPick = fn;
}

/**
 * Map ⇄ UI wiring: taps select vessels / piers (empty map closes the sheet), the selected line's
 * route is highlighted, Follow keeps the camera on the vessel until the user drags, and layer
 * chips toggle map layers.
 */
export function bindMapInteractions(
  extraTap?: (e: MapMouseEvent) => Selection | undefined,
  /** Checked after vessels and piers (map POIs). */
  lateTap?: (e: MapMouseEvent) => Selection | undefined,
): void {
  const { map, ferries } = services();

  map.on('click', (e) => {
    if (mapPick) {
      const pick = mapPick;
      mapPick = null;
      return pick([e.lngLat.lng, e.lngLat.lat]);
    }
    if (interceptor?.(e.point)) return;
    const extra = extraTap?.(e);
    if (extra !== undefined) return select(extra);
    const v = ui.get().ferries ? vesselAt(e.point) : null;
    if (v) return select({ kind: 'vessel', id: v });
    const r = 22;
    const hits = map.queryRenderedFeatures(
      [
        [e.point.x - r, e.point.y - r],
        [e.point.x + r, e.point.y + r],
      ],
      { layers: [LAYER.piers] },
    );
    if (hits.length) return select({ kind: 'pier', id: String(hits[0].properties.id) });
    const late = lateTap?.(e);
    if (late !== undefined) return select(late);
    select(null);
  });
  map.on('dragstart', () => ui.get().follow && ui.set({ follow: false }));

  let prev: UiState | null = null;
  const apply = () => {
    const s = ui.get();
    ferries.selectedId = s.selection?.kind === 'vessel' ? s.selection.id : null;
    if (!prev || prev.ferries !== s.ferries) {
      map.setLayoutProperty('ferries', 'visibility', s.ferries ? 'visible' : 'none');
      map.setLayoutProperty(LAYER.piers, 'visibility', s.ferries ? 'visible' : 'none');
      document.documentElement.classList.toggle('hide-piers', !s.ferries);
    }
    if (!prev || prev.routes !== s.routes) map.setLayoutProperty(LAYER.routes, 'visibility', s.routes ? 'visible' : 'none');
    if (!prev || prev.selection !== s.selection) {
      const lineId = s.selection?.kind === 'vessel' ? ferries.drawn.get(s.selection.id)?.pose.state.lineId : undefined;
      const opacity: ExpressionSpecification | number = lineId
        ? ['case', ['==', ['get', 'lineId'], lineId], 0.95, CONFIG.selection.routeDimOpacity]
        : look().routes.opacity;
      map.setPaintProperty(LAYER.routes, 'line-opacity', opacity);
    }
    prev = s;
  };
  ui.subscribe(apply);
  apply();

  // Follow mode: a smooth camera glide — every frame the centre eases towards the vessel and the
  // camera slowly turns to look along its course (critically damped, no jumps). Reduce-motion: centre only.
  let last = performance.now();
  let bearing: number | null = null;
  const reduced = document.documentElement.classList.contains('motion-reduced');
  const follow = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const s = ui.get();
    const d = s.follow && s.selection?.kind === 'vessel' ? ferries.drawn.get(s.selection.id) : undefined;
    if (d && !map.isMoving()) {
      const f = CONFIG.follow;
      const [tlng, tlat] = sharedFrame.lngLat([d.x, d.y]);
      const c = map.getCenter();
      const k = 1 - Math.exp(-dt / (reduced ? 0.25 : f.tau));
      const opts: { center: [number, number]; bearing?: number } = { center: [c.lng + (tlng - c.lng) * k, c.lat + (tlat - c.lat) * k] };
      if (!reduced && f.rotate && d.pose.state.phase === 'underway') {
        bearing ??= map.getBearing();
        const diff = ((((d.pose.bearing - bearing) % 360) + 540) % 360) - 180;
        bearing += diff * (1 - Math.exp(-dt / f.bearingTau));
        opts.bearing = bearing;
      }
      map.jumpTo(opts);
    } else bearing = null;
    requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
}

function select(sel: Selection): void {
  const s = ui.get();
  const same = s.selection && sel && s.selection.kind === sel.kind && s.selection.id === sel.id;
  if (same) return;
  ui.set({ selection: sel, follow: false, hint: false, sheetSnap: sel ? 'half' : 'peek' });
}
