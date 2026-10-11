import { useEffect, useState } from 'react';
import { NO_EVENT_FILTERS } from '../../events/events';
import { services } from '../../ui/services';
import { useTicker } from '../../ui/hooks';
import { useT } from '../../ui/i18n';
import { ui, useUi } from '../../ui/store';
import { filtersActive, placeVisible } from '../filters';
import { places } from './context';

/** While a filter is on: how many places match in view, and a one-tap way back to everything. */
export function FilterHint() {
  const t = useT();
  const categories = useUi((s) => s.categories);
  const openNow = useUi((s) => s.openNow);
  const ev = useUi((s) => s.ev);
  useTicker(30_000);
  const { map, clock } = services();
  const [, setMoved] = useState(0);
  useEffect(() => {
    const on = () => setMoved((n) => n + 1);
    map.on('moveend', on);
    return () => void map.off('moveend', on);
  }, [map]);
  const f = { categories, openNow, ev };
  if (!filtersActive(f)) return null;
  const store = places();
  const b = map.getBounds();
  const now = clock.now();
  let inView = 0;
  let total = 0;
  for (const p of store.places) {
    if (!placeVisible(store, p.id, f, now)) continue;
    total++;
    if (b.contains(p.lngLat)) inView++;
  }
  const msg = inView ? t('filterInView').replace('{n}', String(inView)) : total ? t('filterNoneHere').replace('{n}', String(total)) : t('noMatches');
  return (
    <div className="filterhint" role="status">
      <span>{msg}</span>
      <button onClick={() => ui.set({ categories: [], openNow: false, ev: NO_EVENT_FILTERS })}>{t('showAll')}</button>
    </div>
  );
}
