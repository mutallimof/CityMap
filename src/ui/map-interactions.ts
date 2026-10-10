import type { ExpressionSpecification, MapMouseEvent } from 'maplibre-gl';
import { CONFIG } from '../config';
import { LAYER } from '../map/style';
import { sharedFrame } from '../three/context';
import { services } from './services';
import { ui, type Selection, type UiState } from './store';

/** Nearest vessel to a screen point within the tap radius (≥ 44 px hit area). */
export function vesselAt(point: { x: number; y: number }): string | null {
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

/**
 * Map ⇄ UI wiring: taps select vessels / piers (empty map closes the sheet), the selected line's
 * route is highlighted, Follow keeps the camera on the vessel until the user drags, and layer
 * chips toggle map layers.
 */
export function bindMapInteractions(extraTap?: (e: MapMouseEvent) => Selection | undefined): void {
  const { map, ferries } = services();

  map.on('click', (e) => {
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
        : CONFIG.routes.opacity;
      map.setPaintProperty(LAYER.routes, 'line-opacity', opacity);
    }
    prev = s;
  };
  ui.subscribe(apply);
  apply();

  // Follow mode: keep the selected vessel centred (eased) while following.
  const follow = () => {
    const s = ui.get();
    if (s.follow && s.selection?.kind === 'vessel') {
      const d = ferries.drawn.get(s.selection.id);
      if (d && !map.isMoving()) map.easeTo({ center: sharedFrame.lngLat([d.x, d.y]), duration: 600, easing: (t) => t });
    }
    setTimeout(follow, 500);
  };
  follow();
}

export function select(sel: Selection): void {
  const s = ui.get();
  const same = s.selection && sel && s.selection.kind === sel.kind && s.selection.id === sel.id;
  if (same) return;
  ui.set({ selection: sel, follow: false, hint: false, sheetSnap: sel ? 'half' : 'peek' });
}
