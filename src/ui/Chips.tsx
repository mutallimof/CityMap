import { useT, type StringKey } from './i18n';
import { ui, useUi, type Category } from './store';
import type { EventFilters } from '../events/events';

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

/** One scrollable chip row: map layers (Ferries, Routes) then Open now and place categories. */
export function Chips({ withCategories }: { withCategories: boolean }) {
  const t = useT();
  const s = useUi((x) => x);
  const toggleCat = (c: Category) =>
    ui.set((st) => ({ categories: st.categories.includes(c) ? st.categories.filter((x) => x !== c) : [...st.categories, c] }));
  return (
    <nav className="chips" aria-label="Layers">
      <button className={`chip ${s.ferries ? 'chip--on' : ''}`} aria-pressed={s.ferries} onClick={() => ui.set({ ferries: !s.ferries })}>
        <span aria-hidden>⛴</span> {t('ferries')}
      </button>
      <button className={`chip ${s.routes ? 'chip--on' : ''}`} aria-pressed={s.routes} onClick={() => ui.set({ routes: !s.routes })}>
        <span aria-hidden>〰</span> {t('routes')}
      </button>
      {withCategories && (
        <>
          <span className="chips__sep" />
          {EV.map((c) => {
            const on = s.ev[c.key];
            return (
              <button key={c.key} className={`chip chip--ev ${on ? 'chip--on' : ''}`} aria-pressed={on} onClick={() => ui.set((st) => ({ ev: { ...st.ev, [c.key]: !st.ev[c.key] } }))}>
                <span aria-hidden>{c.icon}</span> {t(c.label)}
              </button>
            );
          })}
          <span className="chips__sep" />
          <button className={`chip chip--open ${s.openNow ? 'chip--on' : ''}`} aria-pressed={s.openNow} onClick={() => ui.set({ openNow: !s.openNow })}>
            <span className="chip__open" aria-hidden /> {t('openNowChip')}
          </button>
          {CATS.map((c) => {
            const on = s.categories.includes(c.id);
            return (
              <button key={c.id} className={`chip ${on ? 'chip--on' : ''}`} aria-pressed={on} onClick={() => toggleCat(c.id)}>
                <span aria-hidden>{c.icon}</span> {t(c.id as StringKey)}
              </button>
            );
          })}
          <button className={`chip chip--legend ${s.legend ? 'chip--on' : ''}`} aria-pressed={s.legend} onClick={() => ui.set({ legend: !s.legend })}>
            <span aria-hidden>◉</span> {t('legend')}
          </button>
        </>
      )}
    </nav>
  );
}
