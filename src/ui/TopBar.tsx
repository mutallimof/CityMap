import { formatHHMM, toIstanbul } from '../sim/time';
import { useTicker } from './hooks';
import { useT } from './i18n';
import { services } from './services';
import { setLang, ui, useUi } from './store';
import { PlanButton } from '../plan/ui';
import { ThemeButton } from './ThemePanel';

export function TopBar({ extra }: { extra?: React.ReactNode }) {
  useTicker(500);
  const t = useT();
  const lang = useUi((s) => s.lang);
  const sound = useUi((s) => s.sound);
  const { clock, daylight } = services();
  const now = clock.now();
  const live = Math.abs(now - Date.now()) < 60_000 && clock.speed === 1;
  const icon = daylight.theme.night > 0.5 ? '☾' : daylight.theme.golden > 0.5 ? '◐' : '☀';
  return (
    <div className="topbar">
      <button className="chip chip--clock" onClick={() => ui.set((s) => ({ timePanel: !s.timePanel }))} aria-label={t('time')}>
        <span className="chip__icon" aria-hidden>
          {icon}
        </span>
        <span className="clock__txt">
          <b>
            {formatHHMM(toIstanbul(now).seconds)}
            {!live && <span className="chip__dot" title="not live" />}
          </b>
        </span>
        {clock.speed !== 1 && <span className="chip__speed">{clock.speed}×</span>}
      </button>
      {extra}
      <span className="topbar__spacer" />
      <ThemeButton />
      <PlanButton />
      <button className="iconbtn" onClick={() => ui.set({ search: true })} aria-label={t('search')}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
          <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </button>
      <button className={`iconbtn ${sound ? 'iconbtn--on' : ''}`} onClick={() => ui.set({ sound: !sound })} aria-pressed={sound} aria-label={t(sound ? 'soundOff' : 'soundOn')}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
          {sound ? (
            <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.6 7.6 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path d="m15.5 9.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          )}
        </svg>
      </button>
      <button className="iconbtn iconbtn--lang" onClick={() => setLang(lang === 'tr' ? 'en' : 'tr')} aria-label={lang === 'tr' ? 'English' : 'Türkçe'}>
        {lang === 'tr' ? 'EN' : 'TR'}
      </button>
    </div>
  );
}

