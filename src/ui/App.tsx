import type { ReactNode } from 'react';
import { Chips } from './Chips';
import { Fabs } from './Fabs';
import { SearchPanel } from '../search/SearchPanel';
import { Hint } from './Hint';
import { PierHeader, PierSheet } from './PierSheet';
import { Sheet } from './Sheet';
import { TimePanel } from './TimePanel';
import { TopBar } from './TopBar';
import { VesselHeader, VesselSheet } from './VesselSheet';
import { ui, useUi, type Selection } from './store';

export interface AppSlots {
  /** Part B fills these: place sheets, the feed, extra chips in the top bar, nearby lists. */
  topExtra?: ReactNode;
  placeSheet?: (id: string) => { header: ReactNode; body: ReactNode };
  guideSheet?: (id: string) => { header: ReactNode; body: ReactNode };
  nearbyPier?: (id: string) => ReactNode;
  feed?: { header: ReactNode; body: ReactNode };
  categories?: boolean;
  introMs: number;
}

function content(sel: Selection, slots: AppSlots): { header: ReactNode; body: ReactNode } | null {
  if (!sel) return slots.feed ?? null;
  if (sel.kind === 'vessel') return { header: <VesselHeader id={sel.id} />, body: <VesselSheet id={sel.id} /> };
  if (sel.kind === 'pier') return { header: <PierHeader id={sel.id} />, body: <PierSheet id={sel.id} nearby={slots.nearbyPier?.(sel.id)} /> };
  if (sel.kind === 'guide') return slots.guideSheet?.(sel.id) ?? null;
  return slots.placeSheet?.(sel.id) ?? null;
}

export function App(slots: AppSlots) {
  const sel = useUi((s) => s.selection);
  const snap = useUi((s) => s.sheetSnap);
  const c = content(sel, slots);
  return (
    <>
      <div className="hud-top">
        <TopBar extra={slots.topExtra} />
        <Chips withCategories={!!slots.categories} />
        <TimePanel />
      </div>
      <Fabs />
      <SearchPanel />
      <Hint delayMs={slots.introMs} />
      <Sheet
        open={!!c}
        snap={snap}
        onSnap={(sheetSnap) => ui.set({ sheetSnap })}
        onClose={sel ? () => ui.set({ selection: null, follow: false, sheetSnap: 'peek' }) : undefined}
        header={
          <div className="sheet__headrow">
            {c?.header}
            {sel && (
              <button className="sheet__close" onClick={() => ui.set({ selection: null, follow: false, sheetSnap: 'peek' })} aria-label="Close">
                ×
              </button>
            )}
          </div>
        }
      >
        {c?.body}
      </Sheet>
    </>
  );
}
