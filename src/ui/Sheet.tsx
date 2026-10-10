import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SheetSnap } from './store';

const HEIGHTS: Record<SheetSnap, () => number> = {
  peek: () => 132,
  half: () => Math.round(window.innerHeight * 0.48),
  full: () => Math.round(window.innerHeight * 0.88),
};

export interface SheetProps {
  open: boolean;
  snap: SheetSnap;
  onSnap: (s: SheetSnap) => void;
  /** Dragging below peek (or tapping the close button) calls this. */
  onClose?: () => void;
  header: ReactNode;
  /** Rides on the sheet's top edge (e.g. the camera button). */
  accessory?: ReactNode;
  children: ReactNode;
}

/**
 * Bottom sheet with peek / half / full snap points. Drag the header to resize; release snaps to the
 * nearest point (velocity-aware). Transform-only animation, so it stays on the compositor.
 */
export function Sheet({ open, snap, onSnap, onClose, header, accessory, children }: SheetProps) {
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef({ y: 0, h: 0, t: 0 });
  const height = HEIGHTS[snap]();
  const shown = open ? (drag ?? height) : 0;
  const full = HEIGHTS.full();

  useEffect(() => {
    const onResize = () => setDrag(null);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, h: height, t: performance.now() };
    setDrag(height);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag === null) return;
    setDrag(Math.max(60, Math.min(full, start.current.h + (start.current.y - e.clientY))));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag === null) return;
    const dy = start.current.y - e.clientY;
    const v = dy / Math.max(1, performance.now() - start.current.t); // px/ms, + = up
    const target = drag + v * 220;
    setDrag(null);
    if (Math.abs(dy) < 6) {
      // A tap on the header toggles peek ↔ half.
      onSnap(snap === 'peek' ? 'half' : 'peek');
      return;
    }
    if (target < HEIGHTS.peek() * 0.6 && onClose) return onClose();
    const order: SheetSnap[] = ['peek', 'half', 'full'];
    const best = order.reduce((a, b) => (Math.abs(HEIGHTS[b]() - target) < Math.abs(HEIGHTS[a]() - target) ? b : a));
    onSnap(best);
  };

  return (
    <section
      className={`sheet ${drag !== null ? 'sheet--dragging' : ''}`}
      style={{ height: full, transform: `translateY(${full - shown}px)` }}
      aria-hidden={!open}
    >
      {accessory && <div className="sheet__accessory">{accessory}</div>}
      <header className="sheet__header" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <div className="sheet__grip" />
        {header}
      </header>
      <div className="sheet__body">{children}</div>
    </section>
  );
}
