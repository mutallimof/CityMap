import type { ReactNode } from 'react';
import { nextDepartures } from '../sim/state';
import { toIstanbul } from '../sim/time';
import { useTicker } from './hooks';
import { formatWait, useT } from './i18n';
import { services } from './services';
import { useUi } from './store';
import { TimetableBadge, TimetableCredit } from './timetable';

/**
 * Pier: next 5 departures by line with minutes-to-go (printed times for lines on their real timetable,
 * labelled otherwise), then what's nearby.
 */
export function PierSheet({ id, nearby }: { id: string; nearby?: ReactNode }) {
  useTicker(1000);
  const t = useT();
  const lang = useUi((s) => s.lang);
  const { clock, getDay, lineById, pierById } = services();
  const deps = nextDepartures(getDay, id, toIstanbul(clock.now()), 5);
  const served = [...lineById.values()].some((l) => l.stops.includes(id));
  const name = (pid: string) => pierById.get(pid)?.[lang === 'tr' ? 'name' : 'nameEn'] ?? pid;
  return (
    <div className="pier">
      <h3 className="section">{t('nextDepartures')}</h3>
      {!served && <p className="muted">{t('noService')}</p>}
      {served && deps.length === 0 && <p className="muted">{t('noDepartures')}</p>}
      <ul className="deps">
        {deps.map((d) => {
          const line = lineById.get(d.lineId)!;
          return (
            <li key={d.tripId + d.stopId}>
              <span className="swatch swatch--sm" style={{ background: line.color }} />
              <span className="deps__line">
                {line.name[lang]}
                <small className="muted">
                  {' '}
                  {t('to')} {name(d.toStopId)}
                  {d.pier && ` · ${t(d.pier === 'old' ? 'oldPier' : 'newPier')}`}
                </small>{' '}
                {!d.real && <TimetableBadge real={false} />}
              </span>
              <b className="deps__wait">{formatWait(d.inSeconds, lang)}</b>
            </li>
          );
        })}
      </ul>
      {deps.some((d) => d.real) && <TimetableCredit />}
      {nearby}
    </div>
  );
}

export function PierHeader({ id }: { id: string }) {
  const lang = useUi((s) => s.lang);
  const p = services().pierById.get(id);
  return (
    <div className="sheet__title">
      <span className="swatch swatch--pier">⚓︎</span>
      <div>
        <h2>{p ? (lang === 'tr' ? p.name : p.nameEn) : id}</h2>
        <small className="muted">{lang === 'tr' ? 'Vapur iskelesi' : 'Ferry pier'}</small>
      </div>
    </div>
  );
}
