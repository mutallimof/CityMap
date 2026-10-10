import { CONFIG } from '../config';
import { formatHHMM, toIstanbul } from '../sim/time';
import { useTicker } from './hooks';
import { useT } from './i18n';
import { services } from './services';
import { setLang, ui, useUi } from './store';

export function TopBar({ extra }: { extra?: React.ReactNode }) {
  useTicker(500);
  const t = useT();
  const lang = useUi((s) => s.lang);
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
        <b>{formatHHMM(toIstanbul(now).seconds)}</b>
        {clock.speed !== 1 && <span className="chip__speed">{clock.speed}×</span>}
        {!live && <span className="chip__dot" title="not live" />}
        <span className="badge">{t('simulated')}</span>
      </button>
      {extra}
      <button className="chip chip--lang" onClick={() => setLang(lang === 'tr' ? 'en' : 'tr')} aria-label="Language">
        <span className={lang === 'tr' ? 'on' : ''}>TR</span>
        <span className={lang === 'en' ? 'on' : ''}>EN</span>
      </button>
    </div>
  );
}

export const SPEEDS = CONFIG.sim.speeds;
