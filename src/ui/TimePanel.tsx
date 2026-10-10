import { CONFIG } from '../config';
import { formatHHMM, fromIstanbul, toIstanbul } from '../sim/time';
import { sunTimes } from '../time/sun';
import { useTicker } from './hooks';
import { useT } from './i18n';
import { services } from './services';
import { ui, useUi } from './store';

/** Time controls: Now, 1×/10×/60×, a scrubber over the day, quick jumps (sunrise, sunset, night). */
export function TimePanel() {
  useTicker(250);
  const t = useT();
  const open = useUi((s) => s.timePanel);
  const { clock } = services();
  const now = toIstanbul(clock.now());
  const [lon, lat] = CONFIG.camera.center;
  const sun = sunTimes(clock.now(), lat, lon);
  const jump = (seconds: number) => clock.setSimTime(fromIstanbul({ day: now.day, seconds }));
  const sunAt = (ms: number) => toIstanbul(ms).seconds;

  return (
    <div className={`timepanel ${open ? 'timepanel--open' : ''}`} aria-hidden={!open}>
      <div className="timepanel__row">
        <span className="timepanel__time">{formatHHMM(now.seconds)}</span>
        <input
          className="timepanel__scrub"
          type="range"
          min={0}
          max={86_399}
          step={60}
          value={Math.floor(now.seconds)}
          onChange={(e) => jump(Number(e.target.value))}
          aria-label={t('time')}
        />
      </div>
      <div className="timepanel__row">
        <div className="seg" role="group" aria-label={t('speed')}>
          {CONFIG.sim.speeds.map((sp) => (
            <button key={sp} className={clock.speed === sp ? 'on' : ''} onClick={() => clock.setSpeed(sp)}>
              {sp}×
            </button>
          ))}
        </div>
        <button className="pill pill--accent" onClick={() => (clock.resetToNow(), clock.setSpeed(1))}>
          {t('now')}
        </button>
      </div>
      <div className="timepanel__row timepanel__jumps">
        {sun && (
          <>
            <button className="pill" onClick={() => jump(sunAt(sun.sunrise) - 15 * 60)}>
              ☀︎ {t('sunrise')} {formatHHMM(sunAt(sun.sunrise))}
            </button>
            <button className="pill" onClick={() => jump(sunAt(sun.sunset) - 20 * 60)}>
              ◐ {t('sunset')} {formatHHMM(sunAt(sun.sunset))}
            </button>
          </>
        )}
        <button className="pill" onClick={() => jump(22 * 3600)}>
          ☾ {t('night')}
        </button>
      </div>
      <button className="timepanel__close" onClick={() => ui.set({ timePanel: false })} aria-label={t('close')}>
        ×
      </button>
    </div>
  );
}
