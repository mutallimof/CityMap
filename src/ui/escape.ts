import type { UiState } from './store';

type EscapeState = Pick<UiState, 'search' | 'themes' | 'legend' | 'timePanel' | 'selection' | 'sheetSnap'>;

/**
 * What Escape closes: the top-most thing that is open, one per press — search overlay, map-style picker,
 * legend, time panel, then the open sheet (selection), then an expanded feed sheet back to its peek.
 * Returns the state change to apply, or null when nothing is open.
 */
export function escapeAction(s: EscapeState): Partial<UiState> | null {
  if (s.search) return { search: false };
  if (s.themes) return { themes: false };
  if (s.legend) return { legend: false };
  if (s.timePanel) return { timePanel: false };
  if (s.selection) return { selection: null, follow: false, sheetSnap: 'peek' };
  if (s.sheetSnap !== 'peek') return { sheetSnap: 'peek' };
  return null;
}
