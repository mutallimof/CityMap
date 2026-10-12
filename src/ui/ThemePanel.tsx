import { useSyncExternalStore } from 'react';
import { look, onTheme, setTheme, THEMES, type ThemeSpec } from '../themes';
import { useT } from './i18n';
import { ui, useUi } from './store';

const subscribe = (fn: () => void) => onTheme(fn);
/** Re-render when the theme changes. */
export const useTheme = () => useSyncExternalStore(subscribe, look);

/** A tiny original map drawn from the theme's swatches: sea with waves, a shore, a park, a road, blocks, a pin. */
function Preview({ t }: { t: ThemeSpec }) {
  const c = t.card;
  return (
    <svg viewBox="0 0 120 72" className="themecard__art" aria-hidden>
      <rect width="120" height="72" fill={c.water} />
      <path d="M8 22c5-3 9 3 14 0M30 14c5-3 9 3 14 0M14 50c5-3 9 3 14 0" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M52 0h68v72H40c4-10 14-14 12-26-2-12-10-16-6-28 2-8 6-12 6-18z" fill={c.land} />
      <circle cx="100" cy="54" r="11" fill={c.park} />
      <path d="M50 40c18-4 40 2 70-6" stroke={c.road} strokeWidth="5" fill="none" strokeLinecap="round" />
      {[
        [62, 12, 12, 14],
        [78, 16, 10, 10],
        [92, 8, 12, 18],
        [70, 48, 11, 12],
      ].map(([x, y, w, h], i) => (
        <g key={i}>
          <rect x={x} y={y} width={w} height={h} rx={t.style.buildings.roundM > 0 ? 3 : 1} fill={c.building} />
          <rect x={x} y={y} width={w} height={3} rx={1} fill={c.ink} opacity="0.18" />
        </g>
      ))}
      <circle cx="88" cy="34" r="6" fill={c.accent} stroke="#FFFFFF" strokeWidth="2" />
    </svg>
  );
}

/** Map style picker: one preview card per theme; switches live, saved on the device. */
export function ThemePanel() {
  const open = useUi((s) => s.themes);
  const lang = useUi((s) => s.lang);
  const active = useTheme();
  const t = useT();
  if (!open) return null;
  return (
    <div className="themes" role="dialog" aria-label={t('themes')}>
      <div className="legend__head">
        <b>{t('themes')}</b>
        <button className="legend__close" onClick={() => ui.set({ themes: false })} aria-label={t('close')}>
          ×
        </button>
      </div>
      <div className="themes__grid">
        {THEMES.map((th) => (
          <button key={th.id} className={`themecard ${th.id === active.id ? 'themecard--on' : ''}`} aria-pressed={th.id === active.id} onClick={() => setTheme(th.id)}>
            <Preview t={th} />
            <span className="themecard__name">
              {th.name[lang]}
              {th.id === active.id && <span className="themecard__on">✓ {t('themeActive')}</span>}
            </span>
            <span className="themecard__blurb">{th.blurb[lang]}</span>
          </button>
        ))}
      </div>
      <small className="muted">{t('themeNote')}</small>
    </div>
  );
}

/** Top-bar button (palette). */
export function ThemeButton() {
  const t = useT();
  const open = useUi((s) => s.themes);
  return (
    <button className={`iconbtn ${open ? 'iconbtn--on' : ''}`} onClick={() => ui.set((s) => ({ themes: !s.themes, legend: false }))} aria-pressed={open} aria-label={t('themes')}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <path d="M12 3.5c-4.9 0-8.6 3.6-8.6 8.2 0 4.4 3.6 8.3 8 8.3 1.4 0 2.2-.8 2.2-1.9 0-1.3-1-1.6-1-2.6 0-.9.7-1.5 1.7-1.5h2.2c2.6 0 4.1-1.7 4.1-4.1 0-3.7-3.8-6.4-8.6-6.4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="7.8" cy="11.2" r="1.5" fill="currentColor" />
        <circle cx="10.8" cy="7.4" r="1.5" fill="currentColor" />
        <circle cx="15.4" cy="7.8" r="1.5" fill="currentColor" />
      </svg>
    </button>
  );
}
