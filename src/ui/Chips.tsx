import { useT, type StringKey } from './i18n';
import { ui, useUi, type Category } from './store';
import { type EventFilters } from '../events/events';
import { chipCount, filtersActive, NO_FILTERS, placeVisible, toggleCategory, type PlaceFilterState } from '../places/filters';
import { places } from '../places/ui/context';
import { services } from './services';
import { useTicker } from './hooks';

const CATS: { id: Category; icon: string }[] = [
  { id: 'food', icon: '🍽' },
  { id: 'culture', icon: '🎭' },
  { id: 'shopping', icon: '🛍' },
  { id: 'park', icon: '🌳' },
];

const EV: { key: keyof EventFilters; icon: string; label: StringKey }[] = [
  { key: 'today', icon: '✦', label: 'evToday' },
  { key: 'weekend', icon: '☀', label: 'evWeekend' },
  { key: 'workshops', icon: '✂', label: 'evWorkshops' },
  { key: 'free', icon: '◎', label: 'evFree' },
];

/** Count of featured places an active chip stands for (every active filter applies). */
function useCounter(f: PlaceFilterState): (category?: Category) => number {
  useTicker(30_000);
  let store: ReturnType<typeof places> | null = null;
  try {
    store = places();
  } catch {
    return () => 0;
  }
  const s = store;
  const now = services().clock.now();
  const ids = s.places.map((p) => p.id);
  return (category) => chipCount(ids, (id, g) => placeVisible(s, id, g, now), f, category);
}

/**
 * One scrollable chip row: map layers (Ferries, Routes), then place filters — plain on/off toggles that
 * combine (several at once); an active chip is filled and shows how many places it matches; "Clear"
 * appears while any filter is on.
 */
export function Chips({ withCategories }: { withCategories: boolean }) {
  const t = useT();
  const s = useUi((x) => x);
  const f: PlaceFilterState = { categories: s.categories, openNow: s.openNow, ev: s.ev };
  const active = filtersActive(f);
  const count = useCounter(f);
  const toggleCat = (c: Category) => ui.set((st) => ({ categories: toggleCategory(st.categories, c) }));
  const badge = (on: boolean, n: () => number) => (on ? <span className="chip__count">{n()}</span> : null);
  return (
    <nav className="chips" aria-label={t('layers')}>
      <button className={`chip ${s.ferries ? 'chip--on' : ''}`} aria-pressed={s.ferries} onClick={() => ui.set({ ferries: !s.ferries })}>
        <span aria-hidden>⛴</span> {t('ferries')}
      </button>
      <button className={`chip ${s.routes ? 'chip--on' : ''}`} aria-pressed={s.routes} onClick={() => ui.set({ routes: !s.routes })}>
        <span aria-hidden>〰</span> {t('routes')}
      </button>
      {withCategories && (
        <>
          <span className="chips__sep" />
          {active && (
            <button className="chip chip--clear" onClick={() => ui.set({ ...NO_FILTERS })}>
              <span aria-hidden>✕</span> {t('clearChip')}
            </button>
          )}
          {CATS.map((c) => {
            const on = s.categories.includes(c.id);
            return (
              <button key={c.id} className={`chip chip--filter ${on ? 'chip--on' : ''}`} aria-pressed={on} onClick={() => toggleCat(c.id)}>
                <span aria-hidden>{c.icon}</span> {t(c.id as StringKey)}
                {badge(on, () => count(c.id))}
              </button>
            );
          })}
          <span className="chips__sep" />
          <button className={`chip chip--filter chip--open ${s.openNow ? 'chip--on' : ''}`} aria-pressed={s.openNow} onClick={() => ui.set({ openNow: !s.openNow })}>
            <span className="chip__open" aria-hidden /> {t('openNowChip')}
            {badge(s.openNow, () => count())}
          </button>
          {EV.map((c) => {
            const on = s.ev[c.key];
            return (
              <button key={c.key} className={`chip chip--filter chip--ev ${on ? 'chip--on' : ''}`} aria-pressed={on} onClick={() => ui.set((st) => ({ ev: { ...st.ev, [c.key]: !st.ev[c.key] } }))}>
                <span aria-hidden>{c.icon}</span> {t(c.label)}
                {badge(on, () => count())}
              </button>
            );
          })}
          <span className="chips__sep" />
          <button className={`chip chip--legend ${s.legend ? 'chip--on' : ''}`} aria-pressed={s.legend} onClick={() => ui.set({ legend: !s.legend, themes: false })}>
            <span aria-hidden>◉</span> {t('legend')}
          </button>
        </>
      )}
    </nav>
  );
}
